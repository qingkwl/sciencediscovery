// [W34-①] Contract test: the fully-lazy model-secret key resolution shape.
//
// Live regression context: the 13th package paid a per-boot powershell.exe
// DPAPI spawn (~5s inside the startup contention window) even on fresh
// installs with zero ciphertext; W33 fixed that for ciphertext-free data
// dirs; the 14th package then measured 5371ms inside session_store for a
// data dir WITH ciphertext (every returning user, every launch). The fix
// removes key resolution from the boot path entirely:
//   - CustomMcpServers.load() reads the .enc file FIRST and only resolves
//     the key when it exists (W33);
//   - SessionStore.load() never resolves the key (only the rare
//     initialNeo4jPassword env seed does, inline);
//   - remote-host token migration probes its rows and resolves on demand;
//   - the http dispatcher resolves the key before secret-surface routes;
//   - write paths await ensureSecretKey() before first encrypt.
// These source-shape assertions lock that ordering in — a revert to
// boot-path resolution shows up here. (Behavioral coverage of the real
// DPAPI path lives in platform/os/win32.test.ts and the linux-tagged
// suites; on this host those don't run, so the contract is asserted on the
// source, same pattern as bootstrap/platform-contract.test.ts.)
import { createTest } from "../../../../test/support/tagged/compat.mjs";
const { test } = createTest(import.meta.url, { tags: ["category:ut", "os:linux", "os:macos", "os:windows", "arch:amd64", "arch:arm64"] });
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const srcRoot = resolve(import.meta.dirname, "..");

test("CustomMcpServers.load resolves the key only after the encrypted config file exists", async () => {
  const source = await readFile(resolve(srcRoot, "mcp/custom-servers.ts"), "utf8");
  const loadBody = source.split("async load(): Promise<void> {")[1]?.split(/\n  (private|async|readonly) /)[0] ?? "";
  assert.ok(loadBody, "load() body not found");
  const encRead = loadBody.indexOf("readFile(this.path");
  const keyResolve = loadBody.indexOf("modelSecretKey(");
  assert.ok(encRead >= 0, "load() must read the .enc file");
  assert.ok(keyResolve >= 0, "load() must reference modelSecretKey");
  assert.ok(
    loadBody.indexOf("encrypted === undefined") < keyResolve,
    "the ENOENT early-return must precede any key resolution",
  );
  assert.ok(encRead < keyResolve, "the .enc read must come before the key resolution (lazy key)");
});

test("SessionStore.load never resolves the model-secret key on the boot path", async () => {
  const source = await readFile(resolve(srcRoot, "store.ts"), "utf8");
  const loadBody = source.split("async load(): Promise<void> {")[1]?.split("const modelIdsWithSecrets")[0] ?? "";
  assert.ok(loadBody, "store.load() body not found");
  // The env seed is the single allowed inline resolution inside load().
  const seedResolve = loadBody.indexOf("await this.ensureSecretKey()");
  assert.ok(seedResolve >= 0, "the initialNeo4jPassword seed must keep its inline ensureSecretKey (load writes that row)");
  assert.ok(
    loadBody.slice(0, seedResolve).includes("initialNeo4jPassword"),
    "the inline resolution must be gated on initialNeo4jPassword (rare opt-in), not on secrets-table probing",
  );
  const afterSeed = loadBody.slice(seedResolve);
  assert.ok(
    !afterSeed.includes("loadOrCreateSecretKey()"),
    "load() must not resolve the key for existing ciphertext — 14th package measured 5371ms in session_store for a one-row data dir; resolution belongs to ensureSecretKey callers (http secret routes, write paths, migration, prewarm)",
  );
  assert.ok(
    loadBody.includes("await this.migrateRemoteHostTokens()"),
    "the remote-host migration must be awaited inside load()",
  );
});

test("migrateRemoteHostTokens probes rows first and resolves the key only when legacy rows exist", async () => {
  const source = await readFile(resolve(srcRoot, "store.ts"), "utf8");
  const migrateBody = source.split("private async migrateRemoteHostTokens(): Promise<void> {")[1]?.split(/\n  (private|async|readonly) /)[0] ?? "";
  assert.ok(migrateBody, "migrateRemoteHostTokens body not found");
  const probe = migrateBody.indexOf("SELECT host_id, encrypted_token FROM remote_host_secrets");
  const keyResolve = migrateBody.indexOf("await this.ensureSecretKey()");
  assert.ok(probe >= 0, "the migration must probe legacy rows");
  assert.ok(keyResolve >= 0, "the migration must resolve the key on demand");
  assert.ok(
    migrateBody.indexOf("if (!rows.length) return") < keyResolve,
    "the zero-rows early return must precede the key resolution (a data dir without legacy rows pays zero cost)",
  );
});

test("the http dispatcher resolves the key before secret-surface routes", async () => {
  const source = await readFile(resolve(srcRoot, "http/index.ts"), "utf8");
  assert.ok(
    source.includes("function secretSurfaceRoute(pathname: string): boolean"),
    "secretSurfaceRoute must exist",
  );
  const guardBody = source.split("if (secretSurfaceRoute(url.pathname))")[1]?.split("// The desktop shell")[0] ?? "";
  assert.ok(guardBody.length > 0, "the dispatcher secret-route guard must exist");
  assert.ok(
    guardBody.includes("await store.ensureSecretKey()"),
    "the guard must call store.ensureSecretKey()",
  );
  for (const prefix of ["/api/models", "/api/providers", "/api/proxy", "/api/web", "/api/memory", "/api/remote-hosts"]) {
    assert.ok(
      source.includes(`"${prefix}"`),
      `the secret-surface prefix list must include ${prefix}`,
    );
  }
});

test("async write paths await ensureSecretKey before encrypting", async () => {
  const source = await readFile(resolve(srcRoot, "store.ts"), "utf8");
  for (const signature of [
    "async updateWebSettings(input: UpdateWebSettingsRequest)",
    "async createProxyServer(input: CreateProxyServerRequest)",
    "async updateProxyServer(serverId: string, input: UpdateProxyServerRequest)",
    "async updateMemoryGraphSettings(input: UpdateMemoryGraphSettingsRequest)",
    "async createModel(input: CreateModelProfileRequest)",
    "async updateModel(modelId: string, input: UpdateModelProfileRequest)",
    "async setRemoteHostPrivateKey(hostId: string, privateKey: string | null)",
    "async runConfigurationTransaction<T>(sessionId: string, action: () => T)",
  ]) {
    const at = source.indexOf(signature);
    assert.ok(at >= 0, `missing method: ${signature}`);
    const body = source.slice(at, at + 700);
    assert.ok(
      body.includes("await this.ensureSecretKey()"),
      `${signature} must await ensureSecretKey() before its synchronous encrypt path`,
    );
  }
});

test("startApiServer no longer warms the key at boot start (contention window)", async () => {
  const source = await readFile(resolve(srcRoot, "http/index.ts"), "utf8");
  const startBody = source.split("export async function startApiServer")[1]?.split("\nexport ")[0] ?? "";
  assert.ok(startBody, "startApiServer body not found");
  assert.ok(
    !startBody.includes("warmModelSecretKey(resolve("),
    "startApiServer must not warm the key at boot — the 13th package measured the powershell DPAPI spawn at ~5s inside the startup contention window wherever it was issued; the key is now lazy plus post-boot background warm (ready.then hook)",
  );
});

test("ensureSecretKey emits resolution telemetry with the boot anchor (W34-4)", async () => {
  // Package acceptance greps startup-diagnostics.log for this mark to prove
  // the tax actually left the boot path: without it, session_store's
  // component durationMs is indistinguishable between "lazy worked" and
  // "lazy silently regressed" (the 14th package's regression would have
  // been invisible).
  const source = await readFile(resolve(srcRoot, "store.ts"), "utf8");
  const ensureBody = source.split("async ensureSecretKey(): Promise<void> {")[1]?.split(/\n  (private|async|readonly) /)[0] ?? "";
  assert.ok(ensureBody, "ensureSecretKey body not found");
  assert.ok(ensureBody.includes("model_secret_key_resolved"),
    "ensureSecretKey must emit model_secret_key_resolved (the acceptance-run grep mark)");
  assert.ok(ensureBody.includes("durationMs") && ensureBody.includes("bootMs"),
    "the telemetry must carry durationMs (resolution cost) and bootMs (how long after load() it fired — small = regression, large = lazy working)");
  const loadBody = source.split("async load(): Promise<void> {")[1]?.split("const modelIdsWithSecrets")[0] ?? "";
  assert.ok(loadBody.includes("this.loadStartedAtMs = Date.now()"),
    "load() must record the boot anchor for ensureSecretKey's bootMs field");
});
