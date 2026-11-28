// [W31-④] Contract tests for McpSourceCatalog.reloadIfChanged: the first-chat
// warmup path must not reset freshly-established stdio connections when the
// configuration that produced the catalog has not changed.
import { createTest } from "../../../test/support/tagged/compat.mjs";
const { test } = createTest(import.meta.url, { tags: ["category:ut", "os:linux", "os:macos", "os:windows", "arch:amd64", "arch:arm64"] });
import assert from "node:assert/strict";

import type { McpCatalog } from "@sciencediscovery/schema";

import { McpSourceCatalog } from "./catalog.js";

function snapshot(revision: string): McpCatalog {
  return { loadedAt: new Date().toISOString(), revision, servers: [] };
}

/** Minimal registry: one source, never inspected by these tests. */
function registryLike(): never {
  return { list: () => [], listManifests: () => [], get: () => { manifest: { tools: {} } } } as never;
}

function gatewayLike(catalogImpl: () => Promise<McpCatalog>, reloadImpl: () => Promise<McpCatalog>): never {
  return { catalog: catalogImpl, reload: reloadImpl } as never;
}

test("reloadIfChanged returns the current catalog with zero reconnects when the revision matches", async () => {
  let revision = "rev-a";
  let reloadCalls = 0;
  const remote = snapshot("s1");
  const catalog = new McpSourceCatalog(
    registryLike(),
    gatewayLike(async () => remote, async () => {
      reloadCalls += 1;
      return snapshot("s2");
    }),
    undefined,
    undefined,
    undefined,
    () => revision,
  );

  await catalog.refresh();

  // Warmup shape: catalog present, revision unchanged → no gateway.reload call.
  const result = await catalog.reloadIfChanged();
  assert.equal(reloadCalls, 0, "unchanged revision must not reset connections");
  assert.equal(result.revision, remote.revision, "the current snapshot is returned as-is");
});

test("reloadIfChanged falls back to a full reload when the revision changed", async () => {
  let revision = "rev-a";
  let reloadCalls = 0;
  const remote = snapshot("s1");
  const changed = snapshot("s2");
  const catalog = new McpSourceCatalog(
    registryLike(),
    gatewayLike(async () => remote, async () => {
      reloadCalls += 1;
      return changed;
    }),
    undefined,
    undefined,
    undefined,
    () => revision,
  );

  await catalog.refresh();
  revision = "rev-b";

  const result = await catalog.reloadIfChanged();
  assert.equal(reloadCalls, 1, "a real configuration change still rebuilds");
  assert.equal(result.revision, "s2");
  // The new snapshot is now current: a follow-up warmup is again a no-op.
  const again = await catalog.reloadIfChanged();
  assert.equal(reloadCalls, 1);
  assert.equal(again.revision, "s2");
});

test("reloadIfChanged reloads when no catalog snapshot exists yet", async () => {
  let reloadCalls = 0;
  const fresh = snapshot("s1");
  const catalog = new McpSourceCatalog(
    registryLike(),
    gatewayLike(async () => fresh, async () => {
      reloadCalls += 1;
      return fresh;
    }),
    undefined,
    undefined,
    undefined,
    () => "rev-a",
  );

  const result = await catalog.reloadIfChanged();
  assert.equal(reloadCalls, 1, "no snapshot means the warmup must establish one");
  assert.equal(result.revision, "s1");
});

test("reloadIfChanged reloads when no configuration revision provider exists", async () => {
  let reloadCalls = 0;
  const remote = snapshot("s1");
  const catalog = new McpSourceCatalog(
    registryLike(),
    gatewayLike(async () => remote, async () => {
      reloadCalls += 1;
      return remote;
    }),
  );

  await catalog.refresh();
  await catalog.reloadIfChanged();
  assert.equal(reloadCalls, 1, "without a revision source, reload stays explicit");
});

test("reloadIfChanged waits for the in-flight boot refresh instead of stacking a second reload", async () => {
  // Live shape from the 13th package's warm boot: the shell's warmup POST
  // arrives while the boot-time refresh is still connecting the stdio
  // servers (W31-② moved that refresh off the health gate). Without the
  // in-flight await the warmup fell through to gateway.reload — a full
  // second wave right behind the boot wave.
  let reloadCalls = 0;
  let resolveBoot: (catalog: McpCatalog) => void = () => {};
  const bootSnapshot = snapshot("s-boot");
  const catalog = new McpSourceCatalog(
    registryLike(),
    gatewayLike(
      // Boot wave: hangs until the test releases it, like a slow stdio
      // handshake still in progress when the warmup POST lands.
      () => new Promise<McpCatalog>((resolve) => { resolveBoot = resolve; }),
      async () => {
        reloadCalls += 1;
        return snapshot("s-reloaded");
      },
    ),
    undefined,
    undefined,
    undefined,
    () => "rev-a",
  );

  const boot = catalog.refresh(); // boot wave in flight, catalog not yet applied
  const warmup = catalog.reloadIfChanged(); // warmup POST arrives mid-flight
  await new Promise((r) => setTimeout(r, 10)); // let the warmup reach the await
  resolveBoot(bootSnapshot); // boot wave lands first
  await boot;
  const result = await warmup;

  assert.equal(reloadCalls, 0, "the warmup must ride the boot wave, not stack a second reload");
  assert.equal(result.revision, "s-boot", "the boot snapshot is returned");
  // And a later warmup still short-circuits on the landed snapshot.
  const again = await catalog.reloadIfChanged();
  assert.equal(reloadCalls, 0);
  assert.equal(again.revision, "s-boot");
});

test("reloadIfChanged still reloads when the in-flight boot refresh rejects", async () => {
  // Failure semantics: a rejected boot refresh must not wedge the warmup —
  // the in-flight await swallows the error, the revision check misses
  // (no catalog), and the warmup proceeds with a real reload.
  let reloadCalls = 0;
  const reloaded = snapshot("s-reloaded");
  const catalog = new McpSourceCatalog(
    registryLike(),
    gatewayLike(
      () => Promise.reject(new Error("boot wave failed")),
      async () => {
        reloadCalls += 1;
        return reloaded;
      },
    ),
    undefined,
    undefined,
    undefined,
    () => "rev-a",
  );

  const boot = catalog.refresh().catch(() => undefined);
  await boot;
  const result = await catalog.reloadIfChanged();
  assert.equal(reloadCalls, 1, "a failed boot wave leaves the warmup a real reload");
  assert.equal(result.revision, "s-reloaded");
});
