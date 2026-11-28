// [W33-1] Contract test: the lazy model-secret key resolution shape.
//
// Live regression context: the 13th package paid a per-boot powershell.exe
// DPAPI spawn (~5s inside the startup contention window) even on fresh
// installs with zero ciphertext anywhere. The fix resolves the key only
// when ciphertext exists: CustomMcpServers.load() reads the .enc file
// FIRST and only resolves the key when it exists; SessionStore.load()
// probes the secrets tables first. These source-shape assertions lock
// that ordering in — a revert to unconditional resolution shows up here.
// (Behavioral coverage of the real DPAPI path lives in
// platform/os/win32.test.ts and the linux-tagged suites; on this host
// those don't run, so the contract is asserted on the source, same
// pattern as bootstrap/platform-contract.test.ts.)
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

test("SessionStore.load gates the key on the secrets-table probe", async () => {
  const source = await readFile(resolve(srcRoot, "store.ts"), "utf8");
  const loadBody = source.split("async load(): Promise<void> {")[1]?.split("const modelIdsWithSecrets")[0] ?? "";
  assert.ok(loadBody, "store.load() body not found");
  const probe = loadBody.indexOf("hasAnySecret");
  const keyResolve = loadBody.indexOf("this.loadOrCreateSecretKey()");
  assert.ok(probe >= 0, "the secrets-table probe must exist in load()");
  assert.ok(keyResolve >= 0, "loadOrCreateSecretKey must still be referenced");
  assert.ok(probe < keyResolve, "the secrets probe must gate the key resolution (lazy key)");
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
