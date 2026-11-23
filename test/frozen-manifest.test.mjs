// Copyright (C) 2026 Huawei Technologies Co., Ltd
// SPDX-License-Identifier: Apache-2.0
// [D3 P3-1] frozen-manifest injection tests: a deleted file, a
// truncated file and a corrupted file MUST surface as problems — the
// W25 class (content silently wrong while every structural gate stays
// green) moves from "pyc missing" to "onedir file wrong", and the
// manifest is the thing that catches it now.
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTest } from "./support/tagged/compat.mjs";
const { test } = createTest(import.meta.url, { tags: ["category:ut", "os:windows", "os:linux", "os:macos", "arch:amd64", "arch:arm64"] });
import { buildFrozenManifest, verifyFrozenManifest } from "../scripts/lib/frozen-manifest.mjs";

function makeTree() {
  // <root>/jw/_internal/... shape: one onedir with three files.
  const base = mkdtempSync(join(tmpdir(), "sd-fm-"));
  const onedir = join(base, "jw");
  mkdirSync(join(onedir, "_internal", "pkg"), { recursive: true });
  writeFileSync(join(onedir, "sd-jw.exe"), "EXEBYTES-EXEBYTES");
  writeFileSync(join(onedir, "_internal", "pkg", "data.json"), "{\"k\":1}\n");
  writeFileSync(join(onedir, "_internal", "pkg", "mod.pyc"), Buffer.from([1, 2, 3, 4, 5]));
  return { base, onedir };
}

function resolverFor(base) {
  return (entryPath) => {
    // entry paths are "<rootKey>/<rel>" — rootKey is the onedir dir name.
    return join(base, entryPath);
  };
}

test("snapshot + verify round-trips a clean tree", async () => {
  const { base } = makeTree();
  try {
    const manifest = await buildFrozenManifest({ jw: join(base, "jw") });
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.onedirs.jw.fileCount, 3);
    assert.equal(manifest.files.length, 3);
    assert.ok(manifest.files.every((f) => f.sha256.length === 64));
    assert.ok(manifest.files.every((f) => !f.path.includes("\\")), "manifest paths must be forward-slash");
    const { problems, checked } = await verifyFrozenManifest(manifest, resolverFor(base));
    assert.deepEqual(problems, []);
    assert.equal(checked, 3);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("INJECTION: a deleted file is reported (the W25 class, frozen edition)", async () => {
  const { base, onedir } = makeTree();
  try {
    const manifest = await buildFrozenManifest({ jw: onedir });
    rmSync(join(onedir, "_internal", "pkg", "data.json"));
    const { problems } = await verifyFrozenManifest(manifest, resolverFor(base));
    assert.equal(problems.length, 1);
    assert.equal(problems[0].kind, "missing");
    assert.ok(problems[0].path.endsWith("data.json"));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("INJECTION: a corrupted file is reported (same size, different hash)", async () => {
  const { base, onedir } = makeTree();
  try {
    const manifest = await buildFrozenManifest({ jw: onedir });
    // same length, different bytes: the size check passes, the hash must catch it
    const target = join(onedir, "sd-jw.exe");
    writeFileSync(target, "EXEBYTES-EXEBYTEZ");
    const { problems } = await verifyFrozenManifest(manifest, resolverFor(base));
    assert.equal(problems.length, 1);
    assert.equal(problems[0].kind, "hash");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("INJECTION: a truncated file is reported (size mismatch)", async () => {
  const { base, onedir } = makeTree();
  try {
    const manifest = await buildFrozenManifest({ jw: onedir });
    const target = join(onedir, "sd-jw.exe");
    writeFileSync(target, "EXE");
    const { problems } = await verifyFrozenManifest(manifest, resolverFor(base));
    assert.equal(problems.length, 1);
    assert.equal(problems[0].kind, "size");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("a missing onedir during the dual-rail window is skipped, not fatal", async () => {
  const { base } = makeTree();
  try {
    const manifest = await buildFrozenManifest({
      jw: join(base, "jw"),
      services: join(base, "services"), // does not exist
    });
    assert.equal(manifest.onedirs.jw.fileCount, 3);
    assert.equal(manifest.onedirs.services, undefined);
    assert.equal(manifest.files.length, 3);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
