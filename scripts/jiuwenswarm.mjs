// Copyright (C) 2026-2026 Huawei Technologies Co., Ltd
// Licensed under the Apache License, Version 2.0 (the "License");
//
// [windows-desktop] jiuwenswarm.sh 的跨平台 Node 等价物（F2.4）。
// 原 bash 脚本保持不动（Linux/macOS 用户不受影响）。平台分叉全部走
// scripts/lib/stack-platform.mjs（0.B2 分层约定）。

import { execFile, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { delimiter, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import {
  findHostPython, probeTcp, readTextIfExists,
  spawnDetached, venvEntry,
} from "./lib/stack-platform.mjs";

const execFileAsync = promisify(execFile);

const scriptDir = fileURLToPath(new URL(".", import.meta.url));
export const repositoryRoot = resolve(scriptDir, "..");

export function jwConfig(env = process.env) {
  const root = env.JIUWENSWARM_ROOT ?? join(repositoryRoot, ".sciencediscovery-data", "jiuwenswarm");
  let home = env.JIUWENSWARM_HOME;
  if (home && !/^([a-zA-Z]:[\\/]|\\\\|\/)/.test(home)) home = join(repositoryRoot, home);
  const instance = env.JIUWENSWARM_INSTANCE ?? "sciencediscovery";
  return {
    tag: env.JIUWENSWARM_TAG ?? "workswarm0.2.6",
    gitUrl: env.JIUWENSWARM_GIT_URL ?? "https://gitcode.com/openJiuwen/jiuwenswarm.git",
    root,
    instance,
    // Independent of root: the Docker image bakes the install read-only.
    src: env.JIUWENSWARM_SRC ?? join(root, "src"),
    dataDir: home ? join(home, ".jiuwenswarm") : join(root, "data"),
    logFile: home ? join(home, `jiuwenswarm-${instance}.log`) : join(root, "jiuwenswarm.log"),
    home,
  };
}

const venvDir = cfg => join(cfg.src, ".venv");
const jwBin = (cfg, name) => venvEntry(venvDir(cfg), name);
const jwPython = cfg => venvEntry(venvDir(cfg), "python");

function run(command, args, { cwd, env } = {}) {
  return execFileAsync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
}

function instanceWorkspace(cfg) {
  return join(cfg.home ?? process.env.HOME ?? process.env.USERPROFILE ?? "", ".jiuwenswarm-instances", cfg.instance);
}

/** `jiuwenswarm-start --status` → { raw, running, ports: {gateway, web, agent_server} } */
export async function instanceStatus(cfg) {
  const { stdout } = await run(jwBin(cfg, "jiuwenswarm-start"), ["--status", cfg.instance], {
    env: { JIUWENSWARM_DATA_DIR: cfg.dataDir, ...(cfg.home ? { JIUWENSWARM_HOME: cfg.home } : {}) },
  });
  const ports = {};
  for (const line of stdout.split(/\r?\n/)) {
    const match = /^\s+(gateway|web|agent_server):\s*(\S+)\s*$/.exec(line);
    if (match) ports[match[1]] = match[2];
  }
  return { raw: stdout, running: /^\s*Status:\s+running\s*$/m.test(stdout), ports };
}

/** is_up: status says running AND this workspace's gateway port answers. */
export async function isUp(cfg) {
  try {
    const status = await instanceStatus(cfg);
    if (!status.running || !status.ports.gateway) return false;
    return await probeTcp("127.0.0.1", Number(status.ports.gateway));
  } catch {
    return false;
  }
}

async function applyCompatibilityPatches(cfg) {
  const python = findHostPython();
  if (!python) throw new Error("python3/python is required to apply the compatibility patches.");
  await run(python, [join(scriptDir, "swarm-patches.py"), "apply", cfg.src, cfg.tag]);
}

async function verifyCompatibilityPatches(cfg) {
  const { stdout } = await run(jwPython(cfg), [
    "-c", "import importlib.util,pathlib; print(pathlib.Path(importlib.util.find_spec('jiuwenswarm').origin).parent.parent)",
  ]);
  await run(jwPython(cfg), [join(scriptDir, "swarm-patches.py"), "verify", stdout.trim().split(/\r?\n/).pop(), cfg.tag]);
}

/** The three settings the adapter depends on, applied idempotently.
 *  Direct JS port of the inline Python in jiuwenswarm.sh apply_config(). */
export async function applyConfig(cfg, { contextWindowTokens = process.env.JIUWENSWARM_CONTEXT_WINDOW_TOKENS ?? "" } = {}) {
  const configPath = join(instanceWorkspace(cfg), "config", "config.yaml");
  let text = await readTextIfExists(configPath);
  if (text === undefined) throw new Error(`${configPath} not found; run setup first.`);

  // MCP tools must be direct tools: the adapter reaches the model through its
  // own proxy under the tool names ScienceDiscovery defined.
  if (/^progressive_tool_enabled:.*$/m.test(text)) {
    text = text.replace(/^progressive_tool_enabled:.*$/m, "progressive_tool_enabled: false");
  } else {
    text = `progressive_tool_enabled: false\n${text}`;
  }

  const marker = "  # set by scripts/jiuwenswarm.sh";
  const windowValue = contextWindowTokens.trim();
  text = text.replace(new RegExp(`^    context_window_tokens:.*${marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\r?\\n`, "m"), "");
  if (windowValue) {
    if (!/^\d+$/.test(windowValue) || Number(windowValue) <= 0) {
      throw new Error("JIUWENSWARM_CONTEXT_WINDOW_TOKENS must be a positive integer");
    }
    const engine = /^(  context_engine_config:\r?\n)/m;
    if (!engine.test(text)) throw new Error(`context_engine_config not found in ${configPath}`);
    text = text.replace(engine, `$1    context_window_tokens: ${windowValue}${marker}\n`);
  }
  await writeFile(configPath, text, "utf8");
  process.stderr.write(`config: progressive_tool_enabled: false${windowValue ? `, context_window_tokens: ${windowValue}` : ""}\n`);

  // Free search switches: registered only at start-up; default on until the
  // API applies the System Settings values with config.set.
  const envPath = join(instanceWorkspace(cfg), "config", ".env");
  const envText = (await readTextIfExists(envPath)) ?? "";
  const missing = ["FREE_SEARCH_DDG_ENABLED", "FREE_SEARCH_BING_ENABLED"]
    .filter(name => !new RegExp(`^${name}=`, "m").test(envText));
  if (missing.length) {
    const prefix = envText === "" || envText.endsWith("\n") ? "" : "\n";
    await appendFile(envPath, prefix + missing.map(name => `${name}="true"\n`).join(""), "utf8");
  }
}

export async function cmdSetup(cfg = jwConfig()) {
  if (existsSync(jwBin(cfg, "jiuwenswarm-start")) && !existsSync(join(cfg.src, ".git"))) {
    // Pre-baked (Docker image style): nothing to clone, only verify patches.
    process.stderr.write(`Using the pre-installed JiuwenSwarm at ${cfg.src}.\n`);
    await verifyCompatibilityPatches(cfg);
  } else {
    const git = spawnSync("git", ["--version"], { stdio: "ignore" });
    if (git.status !== 0) throw new Error("git is required: install git");
    const uv = spawnSync("uv", ["--version"], { stdio: "ignore" });
    if (uv.status !== 0) throw new Error("uv is required: https://docs.astral.sh/uv/");

    await mkdir(cfg.root, { recursive: true });
    if (!existsSync(join(cfg.src, ".git"))) {
      process.stderr.write(`Cloning JiuwenSwarm ${cfg.tag}...\n`);
      await run("git", ["clone", "--quiet", "--depth", "1", "--branch", cfg.tag, cfg.gitUrl, cfg.src]);
    } else {
      const { stdout } = await run("git", ["-C", cfg.src, "describe", "--tags", "--exact-match"]).catch(() => ({ stdout: "" }));
      const have = stdout.trim();
      if (have !== cfg.tag) {
        throw new Error(`${cfg.src} is at '${have || "an untagged commit"}', not ${cfg.tag}. Remove it or set JIUWENSWARM_ROOT.`);
      }
    }
    await applyCompatibilityPatches(cfg);
    process.stderr.write("Installing JiuwenSwarm (Python 3.12, its own virtualenv)...\n");
    await run("uv", ["sync", "--python", "3.12"], {
      cwd: cfg.src,
      env: {
        UV_HTTP_TIMEOUT: process.env.UV_HTTP_TIMEOUT ?? "300",
        ...(process.env.SCIENCE_AGENT_PYPI_INDEX ? { UV_DEFAULT_INDEX: process.env.SCIENCE_AGENT_PYPI_INDEX } : {}),
      },
    });
  }
  await mkdir(cfg.dataDir, { recursive: true });
  if (!existsSync(instanceWorkspace(cfg))) {
    process.stderr.write(`Creating instance ${cfg.instance}...\n`);
    await run(jwBin(cfg, "jiuwenswarm-init"), ["--name", cfg.instance], {
      env: { JIUWENSWARM_DATA_DIR: cfg.dataDir, ...(cfg.home ? { JIUWENSWARM_HOME: cfg.home } : {}) },
    });
  }
  await applyConfig(cfg);
  process.stderr.write("Done. Start it with: node scripts/jiuwenswarm.mjs start\n");
}

export async function cmdStart(cfg = jwConfig()) {
  if (!existsSync(jwBin(cfg, "jiuwenswarm-start"))) {
    throw new Error("Not installed; run: node scripts/jiuwenswarm.mjs setup");
  }
  await applyConfig(cfg);
  if (await isUp(cfg)) {
    process.stderr.write(`JiuwenSwarm instance ${cfg.instance} is already up.\n`);
    return;
  }
  await verifyCompatibilityPatches(cfg);
  // Detach completely (the nohup/disown equivalent): a background job that
  // keeps the caller's stdout open makes piping scripts wait forever.
  const bootstrapPath = join(repositoryRoot, "services", "adapter", "src", "sciencediscovery_adapter");
  spawnDetached(jwBin(cfg, "jiuwenswarm-start"), ["--name", cfg.instance, "app"], {
    cwd: cfg.root,
    logFile: cfg.logFile,
    env: {
      SCIENCE_AGENT_JIUWENSWARM_BOOTSTRAP: "1",
      PYTHONPATH: [bootstrapPath, process.env.PYTHONPATH].filter(Boolean).join(delimiter),
      JIUWENSWARM_DATA_DIR: cfg.dataDir,
      ...(cfg.home ? { JIUWENSWARM_HOME: cfg.home } : {}),
    },
  });
  for (let attempt = 1; attempt <= 90; attempt += 1) {
    if (await isUp(cfg)) {
      // The gateway accepts connections a few seconds before the agent server answers.
      await delay(6000);
      const status = await instanceStatus(cfg);
      process.stderr.write(`JiuwenSwarm instance ${cfg.instance} is up (gateway ${status.ports.gateway}, web ${status.ports.web}).\n`);
      return;
    }
    await delay(2000);
  }
  throw new Error(`JiuwenSwarm did not come up within 180s; see ${cfg.logFile}`);
}

export async function cmdStop(cfg = jwConfig()) {
  if (!existsSync(jwBin(cfg, "jiuwenswarm-start"))) return;
  await run(jwBin(cfg, "jiuwenswarm-start"), ["--stop", cfg.instance], {
    env: { JIUWENSWARM_DATA_DIR: cfg.dataDir, ...(cfg.home ? { JIUWENSWARM_HOME: cfg.home } : {}) },
  }).catch(() => {});
}

/** env: the exports the adapter needs (start-stack consumes them directly). */
export async function jwEnv(cfg = jwConfig()) {
  if (!existsSync(jwBin(cfg, "jiuwenswarm-start"))) {
    throw new Error("Not installed; run: node scripts/jiuwenswarm.mjs setup");
  }
  const status = await instanceStatus(cfg);
  if (!status.ports.gateway || !status.ports.web) {
    throw new Error("Could not read the instance ports.");
  }
  // Chats use the gateway's /tui route; management calls (mcp.*, models.*) /ws.
  return {
    JIUWENSWARM_GATEWAY_URL: `ws://127.0.0.1:${status.ports.gateway}/tui`,
    JIUWENSWARM_MGMT_URL: `ws://127.0.0.1:${status.ports.web}/ws`,
  };
}

async function main() {
  const cfg = jwConfig();
  switch (process.argv[2]) {
    case "setup": await cmdSetup(cfg); break;
    case "start": await cmdStart(cfg); break;
    case "stop": await cmdStop(cfg); break;
    case "status": {
      if (!existsSync(jwBin(cfg, "jiuwenswarm-start"))) { console.log("not installed"); process.exitCode = 1; break; }
      const status = await instanceStatus(cfg);
      process.stdout.write(status.raw);
      if (await isUp(cfg)) console.log("gateway: reachable");
      else { console.log("gateway: not reachable"); process.exitCode = 1; }
      break;
    }
    case "env": {
      const env = await jwEnv(cfg);
      console.log(`export JIUWENSWARM_GATEWAY_URL=${env.JIUWENSWARM_GATEWAY_URL}`);
      console.log(`export JIUWENSWARM_MGMT_URL=${env.JIUWENSWARM_MGMT_URL}`);
      break;
    }
    default:
      process.stderr.write([
        "Usage: node scripts/jiuwenswarm.mjs <setup|start|stop|status|env>",
        "",
        "Cross-platform (Windows/macOS/Linux) equivalent of scripts/jiuwenswarm.sh.",
        "Env: JIUWENSWARM_TAG / JIUWENSWARM_GIT_URL / JIUWENSWARM_ROOT / JIUWENSWARM_SRC /",
        "     JIUWENSWARM_INSTANCE / JIUWENSWARM_HOME / SCIENCE_AGENT_PYPI_INDEX / UV_HTTP_TIMEOUT",
        "",
      ].join("\n"));
      if (process.argv[2] && !["-h", "--help", "help"].includes(process.argv[2])) process.exitCode = 2;
  }
}

const invokedAsCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsCli) {
  main().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
