import assert from "node:assert/strict";
import { test } from "node:test";
import { libraryFootprints, uninstallFootprints } from "../src/uninstall-data.ts";

test("darwin library footprints: the four ~/Library scatter locations", () => {
  const fps = libraryFootprints("/Users/tester", "darwin");
  assert.equal(fps.length, 4);
  assert.deepEqual(
    fps.map(f => f.id),
    ["app-support", "logs", "prefs", "saved-state"],
  );
  assert.equal(fps[0].path, "/Users/tester/Library/Application Support/sd-shell");
  assert.equal(fps[1].path, "/Users/tester/Library/Logs/sd-shell");
  assert.equal(fps[2].path, "/Users/tester/Library/Preferences/cn.sciencediscovery.desktop.plist");
  assert.equal(fps[3].path, "/Users/tester/Library/Saved Application State/cn.sciencediscovery.desktop.savedState");
});

test("win32: no library footprints — the NSIS uninstaller owns that flow", () => {
  assert.deepEqual(libraryFootprints("C:\\Users\\tester", "win32"), []);
});

test("uninstallFootprints: wizard data dir leads the list, Library scatter follows", () => {
  const fps = uninstallFootprints("/Users/tester/ScienceDiscovery", "/Users/tester", "darwin");
  assert.equal(fps.length, 5);
  assert.equal(fps[0].id, "data-dir");
  assert.equal(fps[0].path, "/Users/tester/ScienceDiscovery");
  assert.equal(fps[0].label.includes("主数据目录"), true);
  assert.equal(fps[4].id, "saved-state");
});

test("uninstallFootprints: null data dir (dev, no wizard) → Library-only list", () => {
  const fps = uninstallFootprints(null, "/Users/tester", "darwin");
  assert.equal(fps.length, 4);
  assert.equal(fps.every(f => f.path !== null), true);
});

test("every footprint carries a zh label (dialog renders them raw)", () => {
  const fps = uninstallFootprints("/data", "/Users/tester", "darwin");
  for (const f of fps) {
    assert.equal(typeof f.label, "string");
    assert.ok(f.label.length > 0);
  }
});
