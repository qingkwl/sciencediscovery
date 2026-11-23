// Copyright (C) 2026 Huawei Technologies Co., Ltd
// SPDX-License-Identifier: Apache-2.0
// [D3 P3-3] frozen-verify unit tests: the first-run integrity probe.
// Clean tree verifies OK; a corrupted file (size first, then hash) and
// a deleted file each surface as their specific problem kind; a
// payload without a manifest returns null (pre-D3 builds are not an
// error).
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTest } from "./support/tagged/compat.mjs";
const { test } = createTest(import.meta.url, { tags: ["category:ut", "os:windows", "os:linux", "os:macos", "arch:amd64", "arch:arm64"] });
import { createHash } from "node:crypto";
import { verifyFrozenPayload } from "../application/src/frozen-verify.ts";

const sha = (b) => createHash("sha256").update(b).digest("hex");

function makePayload() {
  const base = mkdtempSync(join(tmpdir(), "sd-fvtest-"));
  const res = join(base, "resources");
  const jwDir = join(res, "backend", "jw", "frozen", "sd-jw", "sd-jw");
  mkdirSync(join(jwDir, "_internal"), { recursive: true });
  const exeBytes = Buffer.from("EXEBYTES");
  const binBytes = Buffer.from([1, 2, 3, 4]);
  writeFileSync(join(jwDir, "sd-jw.exe"), exeBytes);
  writeFileSync(join(jwDir, "_internal", "data.bin"), binBytes);
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    onedirs: { jw: { fileCount: 2, totalBytes: exeBytes.length + binBytes.length } },
    files: [
      { path: "jw/sd-jw.exe", size: exeBytes.length, sha256: sha(exeBytes) },
      { path: "jw/_internal/data.bin", size: binBytes.length, sha256: sha(binBytes) },
    ],
  };
  writeFileSync(join(res, "frozen-manifest.json"), JSON.stringify(manifest));
  return { base, res, jwDir };
}

test("clean payload verifies OK", async () => {
  const { base, res } = makePayload();
  try {
    const logs = [];
    const verdict = await verifyFrozenPayload(res, (l) => logs.push(l));
    assert.ok(verdict.ok);
    assert.equal(verdict.checked, 2);
    assert.match(logs.join(" "), /frozen integrity: OK/);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test("corrupted file surfaces (size, then hash when only bytes change)", async () => {
  const { base, res, jwDir } = makePayload();
  try {
    appendFileSync(join(jwDir, "sd-jw.exe"), "X"); // size changes
    const v1 = await verifyFrozenPayload(res, () => {});
    assert.ok(!v1.ok);
    assert.equal(v1.problems[0].kind, "size");
    // same-size corruption: rewrite with the same length
    writeFileSync(join(jwDir, "sd-jw.exe"), "EXEBYTEZ");
    const v2 = await verifyFrozenPayload(res, () => {});
    assert.ok(!v2.ok);
    assert.equal(v2.problems[0].kind, "hash");
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test("deleted file surfaces as missing", async () => {
  const { base, res, jwDir } = makePayload();
  try {
    rmSync(join(jwDir, "_internal", "data.bin"));
    const v = await verifyFrozenPayload(res, () => {});
    assert.ok(!v.ok);
    assert.equal(v.problems[0].kind, "missing");
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test("no manifest → null (pre-D3 payload is not an error)", async () => {
  const { base, res } = makePayload();
  try {
    rmSync(join(res, "frozen-manifest.json"));
    const v = await verifyFrozenPayload(res, () => {});
    assert.equal(v, null);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test("unknown schemaVersion is a hard error (payload newer than bootstrap)", async () => {
  const { base, res } = makePayload();
  try {
    const m = JSON.parse(await import("node:fs/promises").then((f) => f.readFile(join(res, "frozen-manifest.json"), "utf8")));
    m.schemaVersion = 99;
    await import("node:fs/promises").then((f) => f.writeFile(join(res, "frozen-manifest.json"), JSON.stringify(m)));
    await assert.rejects(() => verifyFrozenPayload(res, () => {}), /schemaVersion/);
  } finally { rmSync(base, { recursive: true, force: true }); }
});
