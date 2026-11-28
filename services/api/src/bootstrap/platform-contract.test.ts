// [W31-②] Contract test: the initial MCP catalog refresh must stay off the
// /api/health gate. The refresh spawns three sd-services.exe stdio children
// (~1.3s spawn+handshake); awaiting it inside initializePlatformServices
// serialized that cost into every launch's health-200 wait. This locks the
// source shape: fire-and-forget (`void ... .catch(...)`) stays, `await` does
// not come back. Behavioral coverage is impractical here — the surrounding
// function is a full store bootstrap — so the contract is asserted on the
// source, same pattern as application/test/stack.test.ts.
import { createTest } from "../../../../test/support/tagged/compat.mjs";
const { test } = createTest(import.meta.url, { tags: ["category:ut", "os:linux", "os:macos", "os:windows", "arch:amd64", "arch:arm64"] });
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const sourcePath = resolve(import.meta.dirname, "platform.ts");

test("initial MCP catalog refresh stays off the health gate (void, not await)", async () => {
  const source = await readFile(sourcePath, "utf8");
  // The fire-and-forget shape: refresh kicks off, failures are handled by
  // the .catch chain, and the boot continues without waiting.
  assert.match(
    source,
    /void mcpCatalog\.refresh\(\)\.catch\(/,
    "platform.ts must keep the initial mcpCatalog.refresh() fire-and-forget (void ... .catch) — awaiting it puts a ~1.3s stdio handshake back into every launch's /api/health gate",
  );
  // Regression lock: no direct await of the same call anywhere in the file.
  assert.doesNotMatch(
    source,
    /await mcpCatalog\.refresh\(\)/,
    "platform.ts must not await mcpCatalog.refresh() directly — route it through the void/.catch background path so failures stay non-fatal",
  );
});
