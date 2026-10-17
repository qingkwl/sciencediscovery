// Copyright (C) 2026-2026 Huawei Technologies Co., Ltd
// Licensed under the Apache License, Version 2.0 (the "License");
//
// [windows-desktop] start-stack.sh 的跨平台 Node 等价物（F2）。
// 用法：node scripts/start-stack.mjs --mode local [--no-build] [--no-node-build]
//           [--jiuwenswarm | --no-jiuwenswarm]
// 原 bash 脚本保持不动（Linux/macOS 与 Docker 用户不受影响）。
// 平台分叉全部走 scripts/lib/stack-platform.mjs（0.B2 分层约定）。
//
// 产品契约（与 start-stack.sh 逐条对齐，0.A3 §4）：
//   启动顺序 runner → memory-graph → evolve → JiuwenSwarm → adapter → api
//   runner 不健康仅警告（工作台照常）；其余 sidecar 失败即停栈；
//   local 模式 API 前台运行，Ctrl-C 触发整栈清理。

import { existsSync } from "node:fs";
import { rename } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  absoluteFromRepository, findHostPython, findOnPath, isMac, isWindows,
  loadDotEnv, portAvailability, spawnService, killTree, venvPython, waitHealthy,
} from "./lib/stack-platform.mjs";
import { cmdStart as jwStart, isUp as jwIsUp, jwConfig, jwEnv } from "./jiuwenswarm.mjs";

const scriptDir = fileURLToPath(new URL(".", import.meta.url));
const repositoryRoot = resolve(scriptDir, "..");
process.chdir(repositoryRoot);

const say = message => process.stderr.write(`${message}\n`);
const fail = message => { say(message); process.exit(1); };

// ---------------------------------------------------------------------------
// 参数解析（与 bash 版相同的形状与校验）

function parseArgs(argv) {
  const options = { mode: "", modeSeen: false, noBuild: false, noNodeBuild: false, backend: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--mode" || arg.startsWith("--mode=")) {
      if (options.modeSeen) fail("--mode may only be specified once.");
      options.modeSeen = true;
      if (arg === "--mode") {
        index += 1;
        if (index >= argv.length) fail("--mode requires local or docker.");
        options.mode = argv[index];
      } else {
        options.mode = arg.slice("--mode=".length);
      }
    } else if (arg === "--no-build") options.noBuild = true;
    else if (arg === "--no-node-build") options.noNodeBuild = true;
    else if (arg === "--jiuwenswarm") options.backend = "jiuwenswarm";
    else if (arg === "--no-jiuwenswarm") options.backend = "native";
    else if (["-h", "--help"].includes(arg)) { usage(); process.exit(0); }
    else { usage(process.stderr); fail(`Unknown option: ${arg}`); }
  }
  if (!["local", "docker"].includes(options.mode)) {
    usage(process.stderr);
    fail("--mode must be local or docker.");
  }
  return options;
}

function usage(stream = process.stdout) {
  stream.write(`Usage: node scripts/start-stack.mjs --mode local [options]

  --mode local|docker   local: host processes (Windows supported).
                        docker: not supported by this script; use scripts/start-stack.sh.
  --no-build            reuse the last build and Python environments
  --no-node-build       skip pnpm install/build, still sync Python environments
  --jiuwenswarm         run agent turns on JiuwenSwarm (default); needs
                        \`node scripts/jiuwenswarm.mjs setup\` once
  --no-jiuwenswarm      run agent turns on the native loop

Environment mirrors start-stack.sh, notably:
  SCIENCE_DISCOVERY_DATA_DIR / SCIENCE_AGENT_EXECUTOR / SCIENCE_AGENT_PORT /
  SCIENCE_AGENT_RUNNER_PORT / SCIENCE_DISCOVERY_HEALTH_TIMEOUT_SECONDS /
  SCIENCE_AGENT_NPM_REGISTRY / SCIENCE_AGENT_PYPI_INDEX
`);
}

const options = parseArgs(process.argv.slice(2));
if (options.mode === "docker") {
  fail("docker mode is not supported by start-stack.mjs; use scripts/start-stack.sh --mode docker.");
}

// [windows-desktop] F10 —— packaged 模式（安装包内的负载树，无 pnpm/uv/宿主 Python）：
// 跳过源码模式的依赖检查与自举，只复用服务顺序/监督契约（产品契约单点维护）。
// 壳负责注入 SCIENCE_AGENT_PYTHON_PATH（内置解释器）并在首启解包 envs。
const packaged = process.env.SCIENCE_AGENT_PACKAGED === "1";
if (packaged) options.noBuild = true;

// ---------------------------------------------------------------------------
// 准备（prepare_local 等价物）

await loadDotEnv(join(repositoryRoot, ".env"));

// 执行器选择：CLI > SCIENCE_AGENT_EXECUTOR > 默认 jiuwenswarm
const backend = options.backend || process.env.SCIENCE_AGENT_EXECUTOR || "jiuwenswarm";
let useJiuwenswarm;
if (backend === "jiuwenswarm") {
  useJiuwenswarm = true;
  process.env.SCIENCE_AGENT_ADAPTER = "1";
  process.env.SCIENCE_AGENT_EXECUTOR = "jiuwenswarm";
} else if (backend === "native") {
  useJiuwenswarm = false;
  delete process.env.SCIENCE_AGENT_ADAPTER;
  delete process.env.SCIENCE_AGENT_EXECUTOR;
} else {
  fail(`SCIENCE_AGENT_EXECUTOR must be jiuwenswarm or native, got ${backend}.`);
}

// 数据目录变量兼容
if (process.env.SCIENCE_DISCOVERY_DATA_DIR) {
  if (process.env.SCIENCE_AGENT_DATA_DIR) {
    say("[compat] Both SCIENCE_DISCOVERY_DATA_DIR and SCIENCE_AGENT_DATA_DIR are set; SCIENCE_DISCOVERY_DATA_DIR takes precedence.");
  }
  process.env.SCIENCE_AGENT_DATA_DIR = process.env.SCIENCE_DISCOVERY_DATA_DIR;
} else if (process.env.SCIENCE_AGENT_DATA_DIR) {
  say("[compat] SCIENCE_AGENT_DATA_DIR is deprecated; using its value as SCIENCE_DISCOVERY_DATA_DIR.");
  process.env.SCIENCE_DISCOVERY_DATA_DIR = process.env.SCIENCE_AGENT_DATA_DIR;
}

// 依赖检查：收集式，一次报全（与 bash 版同语义；curl 不再必需——健康检查用 fetch）
const dependencyProblems = [];
const noteProblem = (headline, ...remedies) =>
  dependencyProblems.push([headline, ...remedies].map(line => `    ${line}`).join("\n"));

if (packaged) {
  // packaged 模式只依赖本进程（壳自带 node）+ 壳注入的内置 Python；
  // pnpm/uv/宿主发现链一概不适用（干净机上它们不存在，也不需要存在）。
  const bundled = process.env.SCIENCE_AGENT_PYTHON_PATH;
  if (!bundled || !existsSync(bundled)) {
    fail("SCIENCE_AGENT_PACKAGED=1 requires SCIENCE_AGENT_PYTHON_PATH to point at the bundled Python interpreter.");
  }
} else {
  const nodeVersion = process.versions.node.split(".").map(Number);
  if (!(nodeVersion[0] > 22 || (nodeVersion[0] === 22 && nodeVersion[1] >= 19))) {
    noteProblem(`Node.js 22.19+ is required; found ${process.versions.node}.`,
      "Upgrade it, for example: nvm install 22 && nvm use 22");
  }
  if (!findOnPath("pnpm")) {
    noteProblem("pnpm 11.1.2 is required to install and build the workspace, but no 'pnpm' is on PATH.",
      "Enable it through the bundled corepack: corepack enable && corepack prepare pnpm@11.1.2 --activate");
  }
  const hostPython = findHostPython();
  if (!hostPython) {
    noteProblem("Python 3 is required for workspace analysis, but no python interpreter was found.",
      isWindows
        ? "Install it from https://www.python.org/downloads/ (the py launcher, python3 or python are all recognised)."
        : "Install your distribution's python3 package (Debian/Ubuntu: sudo apt-get install -y python3).");
  }
  if (!findOnPath("uv")) {
    noteProblem("uv 0.9+ is required to build the Python service environments, but no 'uv' is on PATH.",
      isWindows
        ? "Install it: winget install astral-sh.uv  (or see https://docs.astral.sh/uv/)"
        : "Install it: curl -LsSf https://astral.sh/uv/install.sh | sh");
  }
  if (dependencyProblems.length) {
    process.stderr.write(`ScienceDiscovery cannot start from source: ${dependencyProblems.length} host dependency problem(s).\n\n`);
    for (const problem of dependencyProblems) process.stderr.write(`  - ${problem}\n\n`);
    process.stderr.write("  Requirements table: README.md#requirements\n  Local source mode:  docs/en/how-to/deployment.md#local-mode-host-processes\n");
    process.exit(1);
  }
  process.env.SCIENCE_AGENT_PYTHON_PATH ??= hostPython;
}
if (isMac) process.env.SCIENCE_AGENT_SHELL_PATH ??= "/bin/bash";
else if (isWindows) {
  // [windows-desktop] Windows 无 /usr/bin/bash 语义：优先 Git Bash，退回 cmd。
  // Provider A 的 shell 执行语义由 F3/F5 定义，这里只保证变量有值。
  process.env.SCIENCE_AGENT_SHELL_PATH ??=
    findOnPath("bash") ?? process.env.ComSpec ?? "C:\\Windows\\System32\\cmd.exe";
} else {
  process.env.SCIENCE_AGENT_SHELL_PATH ??= "/usr/bin/bash";
}

// 沙箱 provider 裁决（L6 的 Windows 分支）：Windows 直跑 = Provider A 语义，
// runner 进程内自探测并优雅降级（0.8 炸点③-5 实证），启动链不再在此退出。
let sandboxProvider = process.env.SCIENCE_AGENT_SANDBOX_PROVIDER ?? "auto";
if (sandboxProvider === "auto") {
  if (isMac) sandboxProvider = "seatbelt";
  else if (isWindows) {
    sandboxProvider = "";
    say("[platform] Windows host: no native sandbox provider; the runner will report its capability and degrade gracefully (Provider A, approval fallback applies).");
  } else sandboxProvider = "bubblewrap";
}
if (!["", "bubblewrap", "seatbelt"].includes(sandboxProvider)) {
  fail("SCIENCE_AGENT_SANDBOX_PROVIDER must be auto, bubblewrap, or seatbelt.");
}

// 数据目录解析 + 遗留 data/ 一次性迁移
const dataDir = absoluteFromRepository(repositoryRoot, process.env.SCIENCE_DISCOVERY_DATA_DIR ?? ".sciencediscovery-data");
if (!process.env.SCIENCE_DISCOVERY_DATA_DIR) {
  const legacy = join(repositoryRoot, "data");
  if (existsSync(legacy)) {
    if (existsSync(dataDir)) {
      say(`[compat] Skipped moving legacy data directory ${legacy} to ${dataDir}: target already exists.`);
    } else {
      try {
        await rename(legacy, dataDir);
        say(`[compat] Moved legacy data directory ${legacy} to ${dataDir}.`);
      } catch (error) {
        // Windows 上目录被占用时 rename 失败（炸点象限：锁/权限）
        fail(`[compat] Could not move legacy data directory ${legacy}: ${error.message}. Close the programs using it and retry.`);
      }
    }
  }
}
const envsDir = join(dataDir, "envs");

// 构建（--no-build 跳过）。镜像变量只作用于本进程，不写用户/全局配置。
const runOpts = { cwd: repositoryRoot };
async function runStep(label, command, args, extraEnv = {}, cwd) {
  say(`==> ${label}`);
  const child = spawnService(command, args, { ...runOpts, ...(cwd ? { cwd } : {}), env: extraEnv });
  const code = await new Promise(resolveExit => child.once("exit", resolveExit));
  if (code !== 0) fail(`${label} failed with exit code ${code}.`);
}

async function uvSyncProject(projectDir, envDir, { locked, extraArgs = [] }) {
  const env = { UV_PROJECT_ENVIRONMENT: envDir };
  if (process.env.SCIENCE_AGENT_PYPI_INDEX) env.UV_DEFAULT_INDEX = process.env.SCIENCE_AGENT_PYPI_INDEX;
  // 自定义 PyPI 时 --locked 必失败（uv.lock 记录索引 URL）；备份/恢复锁文件，
  // 镜像永不弄脏工作树（与 bash 版 uv_sync_project 同语义）。
  // bash 版在子 shell 里 cd 进项目目录再 sync（`uv sync` 按 cwd 找 pyproject）。
  if (process.env.SCIENCE_AGENT_PYPI_INDEX && locked) {
    const lockfile = join(projectDir, "uv.lock");
    const backup = join(projectDir, "uv.lock.stack-backup");
    await rename(lockfile, backup);
    try {
      await runStep(`uv sync ${projectDir}`, "uv", ["sync", ...extraArgs], env, projectDir);
    } finally {
      await rename(backup, lockfile);
    }
    return;
  }
  await runStep(`uv sync ${projectDir}`, "uv", ["sync", ...(locked ? ["--locked"] : []), ...extraArgs], env, projectDir);
}

if (!options.noBuild) {
  if (!options.noNodeBuild) {
    const registryArgs = process.env.SCIENCE_AGENT_NPM_REGISTRY ? ["--registry", process.env.SCIENCE_AGENT_NPM_REGISTRY] : [];
    await runStep("pnpm install", "pnpm", ["install", "--frozen-lockfile", "--ignore-scripts", ...registryArgs]);
  }
  await uvSyncProject(join(repositoryRoot, "services", "paper"), join(envsDir, "paper"), { locked: true });
  // Pinned to Python 3.12 via services/gateway/.python-version.
  await uvSyncProject(join(repositoryRoot, "services", "gateway"), join(envsDir, "gateway"), { locked: false });
  if (!options.noNodeBuild) {
    await runStep("pnpm build", "pnpm", ["build"]);
    if (!isWindows && !isMac) await runStep("pnpm runner:binary", "pnpm", ["runner:binary"]);
  }
}

// gateway 解释器定位（L9）：两个已知位置，顺序与 resolveMcpPython 一致；
// venvPython() 内部处理 bin/python vs Scripts/python.exe（炸点③-2）。
let gatewayPython = process.env.SCIENCE_AGENT_GATEWAY_PYTHON_PATH;
if (!gatewayPython || !existsSync(gatewayPython)) {
  const candidates = [venvPython(join(envsDir, "gateway")), venvPython(join(repositoryRoot, "services", "gateway", ".venv"))];
  gatewayPython = candidates.find(existsSync);
}
if (!gatewayPython) {
  fail(packaged
    ? `${join(envsDir, "gateway")} is missing; the packaged installation is incomplete — reinstall ScienceDiscovery.`
    : `${join(envsDir, "gateway")} is missing (needed for the bundled Python MCP servers). Run without --no-build once to provision it.`);
}

// memory-graph：无条件 provision（功能开关在 System Settings，环境必须就绪）
let memoryGraphPython = venvPython(join(envsDir, "memory-graph"));
if (!existsSync(memoryGraphPython)) {
  if (packaged) fail(`${join(envsDir, "memory-graph")} is missing; the packaged installation is incomplete — reinstall ScienceDiscovery.`);
  say("Provisioning the memory-graph Python environment...");
  await uvSyncProject(join(repositoryRoot, "services", "memory-graph"), join(envsDir, "memory-graph"), { locked: false });
}
if (!existsSync(memoryGraphPython)) memoryGraphPython = "";

// evolve：--extra candidates 装候选运行时（AST gate 放行 pandas/numpy/scipy/sklearn）
let evolvePython = venvPython(join(envsDir, "evolve"));
if (!existsSync(evolvePython)) {
  if (packaged) fail(`${join(envsDir, "evolve")} is missing; the packaged installation is incomplete — reinstall ScienceDiscovery.`);
  say("Provisioning the evolve Python environment...");
  const extraArgs = process.env.SCIENCE_AGENT_EVOLVE_STUB_ONLY === "1" ? [] : ["--extra", "candidates"];
  await uvSyncProject(join(repositoryRoot, "services", "evolve"), join(envsDir, "evolve"), { locked: false, extraArgs });
}
if (!existsSync(evolvePython)) evolvePython = "";

// adapter：jiuwenswarm 前门（默认开）
let adapterPython = "";
if (process.env.SCIENCE_AGENT_ADAPTER === "1") {
  adapterPython = venvPython(join(envsDir, "adapter"));
  if (!existsSync(adapterPython)) {
    if (packaged) fail(`${join(envsDir, "adapter")} is missing; the packaged installation is incomplete — reinstall ScienceDiscovery.`);
    say("Provisioning the adapter Python environment...");
    await uvSyncProject(join(repositoryRoot, "services", "adapter"), join(envsDir, "adapter"), { locked: false });
  }
  if (!existsSync(adapterPython)) adapterPython = "";
}

// runner 环境组装（L13）：*_PATH/*_DIR passthrough 一律转仓库绝对路径
//（absoluteFromRepository 已识别 C:\ 与 UNC，炸点③-1 修复）
const runnerEnv = {
  SCIENCE_AGENT_BWRAP_PATH: process.env.SCIENCE_AGENT_BWRAP_PATH ?? "bwrap",
  ...(sandboxProvider ? { SCIENCE_AGENT_SANDBOX_PROVIDER: sandboxProvider } : {}),
  SCIENCE_AGENT_SEATBELT_PATH: process.env.SCIENCE_AGENT_SEATBELT_PATH ?? "/usr/bin/sandbox-exec",
  SCIENCE_AGENT_PYTHON_PATH: process.env.SCIENCE_AGENT_PYTHON_PATH,
  SCIENCE_AGENT_DATA_DIR: dataDir,
  SCIENCE_AGENT_RUNNER_HOST: process.env.SCIENCE_AGENT_RUNNER_HOST ?? "127.0.0.1",
  SCIENCE_AGENT_RUNNER_PORT: process.env.SCIENCE_AGENT_RUNNER_PORT ?? "4311",
  SCIENCE_AGENT_RUNNER_TOKEN: process.env.SCIENCE_AGENT_RUNNER_TOKEN ?? "sciencediscovery-runner-local",
  SCIENTIFIC_ENVS: "1",
};
for (const name of [
  "SCIENCE_AGENT_PROVISIONER_PATH", "SCIENCE_AGENT_PACKAGE_CACHE_DIR",
  "SCIENCE_AGENT_SCIENTIFIC_CHANNELS", "SCIENCE_AGENT_KERNEL_IDLE_MS",
  "SCIENCE_AGENT_EXEC_TIMEOUT_MS", "SCIENCE_AGENT_NPU_BROKER",
  "SCIENCE_AGENT_NPU_WORKLOAD_CONFIG", "SCIENCE_AGENT_NPU_PYTHON",
  "SCIENCE_AGENT_NPU_SMOKE_SCRIPT", "SCIENCE_AGENT_NPU_PROTENIX_SCRIPT",
]) {
  if (process.env[name]) {
    runnerEnv[name] = name.endsWith("_PATH") || name.endsWith("_DIR")
      ? absoluteFromRepository(repositoryRoot, process.env[name])
      : process.env[name];
  }
}

// pnpm api 以服务目录为 cwd，这两个解析必须显式给出（L14）
process.env.SCIENCE_AGENT_EXTENSIONS_CONFIG_PATH =
  absoluteFromRepository(repositoryRoot, process.env.SCIENCE_AGENT_EXTENSIONS_CONFIG_PATH ?? "extensions_config.json");
process.env.SCIENCE_AGENT_GATEWAY_PYTHON_PATH ??= gatewayPython;

// ---------------------------------------------------------------------------
// 端口预检（炸点③-4：Windows 保留段 EACCES 要在拉起前报出，附上解法）

const runnerHost = runnerEnv.SCIENCE_AGENT_RUNNER_HOST;
const runnerPort = Number(runnerEnv.SCIENCE_AGENT_RUNNER_PORT);
const publicPort = Number(process.env.SCIENCE_AGENT_PORT ?? 4310);
const legacyPort = Number(process.env.SCIENCE_AGENT_LEGACY_PORT ?? publicPort + 100);
const memoryGraphPort = Number(process.env.SCIENCE_AGENT_MEMORY_GRAPH_PORT ?? 17674);
const evolvePort = Number(process.env.SCIENCE_AGENT_EVOLVE_PORT ?? 4313);

const portsToCheck = [
  { name: "runner", host: runnerHost, port: runnerPort },
  { name: "api", host: "127.0.0.1", port: useJiuwenswarm ? legacyPort : publicPort },
  ...(useJiuwenswarm ? [{ name: "adapter", host: "127.0.0.1", port: publicPort }] : []),
  ...(process.env.SCIENCE_AGENT_MEMORY_GRAPH_AVAILABLE !== "0" && memoryGraphPython
    ? [{ name: "memory-graph", host: "127.0.0.1", port: memoryGraphPort }] : []),
  ...(evolvePython ? [{ name: "evolve", host: "127.0.0.1", port: evolvePort }] : []),
];
const portFailures = [];
for (const { name, host, port } of portsToCheck) {
  const result = await portAvailability(host, port);
  if (!result.ok) portFailures.push({ name, host, port, code: result.code });
}
if (portFailures.length) {
  say("Cannot bind the ports this stack needs:");
  for (const { name, host, port, code } of portFailures) {
    say(`  - ${name} ${host}:${port} — ${code === "EACCES"
      ? "reserved by Windows (Hyper-V/WSL dynamic exclusion range). Check: netsh interface ipv4 show excludedportrange protocol=tcp; pick a port outside the reserved ranges and set the matching SCIENCE_AGENT_*_PORT."
      : code === "EADDRINUSE"
        ? "already in use. Find the process: netstat -ano | findstr :" + port
        : `unavailable (${code}).`}`);
  }
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 拉起（start_stack 等价物：顺序与监督语义是产品契约）

const children = [];
let cleanedUp = false;
function cleanup() {
  if (cleanedUp) return;
  cleanedUp = true;
  for (const child of children.splice(0)) killTree(child);
}
process.on("SIGINT", () => { cleanup(); process.exit(130); });
process.on("SIGTERM", () => { cleanup(); process.exit(143); });
process.on("exit", cleanup);

const healthTimeoutSeconds = Number(process.env.SCIENCE_DISCOVERY_HEALTH_TIMEOUT_SECONDS ?? 10);
const runnerUrl = process.env.SCIENCE_AGENT_RUNNER_URL ?? `http://${runnerHost}:${runnerPort}`;

try {
  say("Starting the sandbox runner daemon...");
  children.push(spawnService(process.execPath, [join("services", "runner", "dist", "server.js")], { env: runnerEnv }));
  if (!await waitHealthy("runner", `${runnerUrl}/health`, { timeoutSeconds: healthTimeoutSeconds })) {
    say("WARNING: local compute is unavailable; the workbench will remain accessible. Configure a remote Runner or repair local execution.");
  }

  // [windows-desktop] F10.6 —— 产品契约变更（owner 2026-10-16 拍板，原 F2 逐串行）：
  // {memory-graph, evolve, JiuwenSwarm} 并行拉起，全部健康后再放 adapter/api
  //（adapter 全量继承 process.env，必须等 jwEnv 注入完成）。
  // 失败语义保持 fail-fast：任一 reject → 外层 catch → cleanup() 杀全部兄弟。
  if (useJiuwenswarm && !adapterPython) {
    fail("SCIENCE_AGENT_EXECUTOR=jiuwenswarm needs the adapter: also set SCIENCE_AGENT_ADAPTER=1.");
  }
  const parallel = [];
  if (process.env.SCIENCE_AGENT_MEMORY_GRAPH_AVAILABLE !== "0" && memoryGraphPython) {
    parallel.push((async () => {
      say("Starting the memory-graph service...");
      children.push(spawnService(memoryGraphPython, ["-m", "sciencediscovery_memory_graph.server"], {
        env: {
          SCIENCE_AGENT_DATA_DIR: dataDir,
          SCIENCE_AGENT_MEMORY_GRAPH_NEO4J_HTTP: process.env.SCIENCE_AGENT_MEMORY_GRAPH_NEO4J_HTTP ?? "http://127.0.0.1:7474",
          SCIENCE_AGENT_MEMORY_GRAPH_INTERNAL_TOKEN: process.env.SCIENCE_AGENT_MEMORY_GRAPH_INTERNAL_TOKEN ?? "sciencediscovery-memory-graph-local",
        },
      }));
      if (!await waitHealthy("memory-graph", `http://127.0.0.1:${memoryGraphPort}/health`, { timeoutSeconds: healthTimeoutSeconds })) {
        throw new Error("memory-graph sidecar failed to start; stopping the stack.");
      }
    })());
  }
  if (evolvePython) {
    parallel.push((async () => {
      say("Starting the evolve service...");
      children.push(spawnService(evolvePython, ["-m", "sciencediscovery_evolve.server"], {
        env: {
          SCIENCE_AGENT_DATA_DIR: dataDir,
          SCIENCE_AGENT_EVOLVE_INTERNAL_TOKEN: process.env.SCIENCE_AGENT_EVOLVE_INTERNAL_TOKEN ?? "sciencediscovery-evolve-local",
        },
      }));
      if (!await waitHealthy("evolve", `http://127.0.0.1:${evolvePort}/health`, { timeoutSeconds: healthTimeoutSeconds })) {
        throw new Error("evolve sidecar failed to start; stopping the stack.");
      }
    })());
  }
  if (useJiuwenswarm) {
    parallel.push((async () => {
      const cfg = jwConfig();
      if (!process.env.JIUWENSWARM_GATEWAY_URL || !process.env.JIUWENSWARM_MGMT_URL) {
        const env = await jwEnv(cfg).catch(() => null);
        if (env) Object.assign(process.env, env);
      }
      const gatewayPort = Number(new URL(process.env.JIUWENSWARM_GATEWAY_URL ?? "ws://127.0.0.1:0/").port || 0);
      if (!gatewayPort || !await jwIsUp(cfg)) {
        say("JiuwenSwarm is not running; starting it (node scripts/jiuwenswarm.mjs start)...");
        await jwStart(cfg);
        Object.assign(process.env, await jwEnv(cfg));
      }
    })());
  }
  await Promise.all(parallel);

  if (adapterPython) {
  say(`Starting the adapter on port ${publicPort} (legacy API on ${legacyPort})...`);
  children.push(spawnService(adapterPython, ["-m", "sciencediscovery_adapter.server"], {
    env: { SCIENCE_AGENT_LEGACY_PORT: String(legacyPort) },
  }));
  process.env.SCIENCE_AGENT_ADAPTER_URL ??= `http://127.0.0.1:${publicPort}`;
}

// API：local 模式前台（产品契约）。Windows 上绕过 pnpm.cmd（炸点 L15），
// 直接以当前 Node 跑 dist/server.js，cwd 与 pnpm --filter 一致。
say("Starting the control API...");
const apiEntry = process.env.SCIENCE_AGENT_API_ENTRYPOINT ?? join(repositoryRoot, "services", "api", "dist", "server.js");
if (process.env.SCIENCE_AGENT_API_ENTRYPOINT && !existsSync(process.env.SCIENCE_AGENT_API_ENTRYPOINT)) {
  fail("SCIENCE_AGENT_API_ENTRYPOINT requires a local existing module");
}
const apiChild = spawnService(process.execPath, [apiEntry], {
  cwd: join(repositoryRoot, "services", "api"),
  env: useJiuwenswarm
    ? { SCIENCE_AGENT_PORT: String(legacyPort), SCIENCE_AGENT_PUBLIC_PORT: String(publicPort) }
    : { SCIENCE_AGENT_PORT: String(publicPort) },
});
children.push(apiChild);

// 前台等待 API 退出（ Ctrl-C 走 SIGINT handler → cleanup 整栈 ）
const apiExitCode = await new Promise(resolveExit => apiChild.once("exit", resolveExit));
cleanup();
process.exit(apiExitCode ?? 0);
} catch (error) {
  cleanup();
  fail(error instanceof Error ? error.message : String(error));
}
