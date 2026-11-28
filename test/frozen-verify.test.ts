// Copyright (C) 2026 Huawei Technologies Co., Ltd
// SPDX-License-Identifier: Apache-2.0
// [D3 P3-3 / W17] frozen-verify unit tests: the first-run integrity
// probe and its W17 verify-tier demotion.
//
// P3-3 cases: a clean tree verifies OK; a corrupted file (size first,
// then hash) and a deleted file each surface as their specific problem
// kind; a payload without a manifest returns a mode:"none" verdict
// (pre-D3 builds are not an error).
//
// W17 cases: after a successful full pass the stamp is written and the
// NEXT launch runs the stat+size fast pass only (mode:"fast", no
// hashing); a stamp whose identity mismatches (upgraded/reinstalled
// payload) falls back to full; a size drift on a stamped payload
// escalates to full (and the hash verdict still decides); a FAILED
// full pass never writes a stamp; the stamp write mkdirs its parent
// (first launch: dataDir\envs does not exist yet when verify runs).
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, appendFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { createTest } from "./support/tagged/compat.mjs";
const { test } = createTest(import.meta.url, { tags: ["category:ut", "os:windows", "os:linux", "os:macos", "arch:amd64", "arch:arm64"] });
import { createHash } from "node:crypto";
import { verifyFrozenPayload } from "../application/src/frozen-verify.ts";
import { frozenVerifyStampPath, payloadIdentity } from "../application/src/bootstrap.ts";

const sha = (b) => createHash("sha256").update(b).digest("hex");

// The makePayload fixture mirrors assemble 5.5c's staging: jw entries
// live under backend\jw\frozen\sd-jw\sd-jw, services entries under
// envs-template\frozen\sd-services\sd-services. version.json rides at
// the resources root so payloadIdentity() has something to key on.
function makePayload() {
  const base = mkdtempSync(join(tmpdir(), "sd-fvtest-"));
  const res = join(base, "resources");
  const dataDir = join(base, "data");
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
  writeFileSync(join(res, "version.json"), JSON.stringify({ repoCommit: "abc123", builtAt: "2026-11-26T00:00:00Z" }));
  return { base, res, dataDir, jwDir };
}

const call = (res, opts?) => verifyFrozenPayload(res, () => {}, opts);

// --- [D3 P3-3] base integrity cases ---------------------------------------

test("clean payload verifies OK (full, no stamp options → legacy call shape)", async () => {
  const { base, res } = makePayload();
  try {
    const logs = [];
    const verdict = await verifyFrozenPayload(res, (l) => logs.push(l));
    assert.ok(verdict.ok);
    assert.equal(verdict.mode, "full"); // no stamp passed → always full
    assert.equal(verdict.checked, 2);
    assert.match(logs.join(" "), /frozen integrity: OK/);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test("corrupted file surfaces (size, then hash when only bytes change)", async () => {
  const { base, res, jwDir } = makePayload();
  try {
    appendFileSync(join(jwDir, "sd-jw.exe"), "X"); // size changes
    const v1 = await call(res);
    assert.ok(!v1.ok);
    assert.equal(v1.problems[0].kind, "size");
    // same-size corruption: rewrite with the same length
    writeFileSync(join(jwDir, "sd-jw.exe"), "EXEBYTEZ");
    const v2 = await call(res);
    assert.ok(!v2.ok);
    assert.equal(v2.problems[0].kind, "hash");
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test("deleted file surfaces as missing", async () => {
  const { base, res, jwDir } = makePayload();
  try {
    rmSync(join(jwDir, "_internal", "data.bin"));
    const v = await call(res);
    assert.ok(!v.ok);
    assert.equal(v.problems[0].kind, "missing");
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test("no manifest → mode:none verdict (pre-D3 payload is not an error)", async () => {
  const { base, res } = makePayload();
  try {
    rmSync(join(res, "frozen-manifest.json"));
    const v = await call(res);
    assert.ok(v.ok); // W17: null became a mode:"none" verdict object
    assert.equal(v.mode, "none");
    assert.equal(v.checked, 0);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test("unknown schemaVersion is a hard error (payload newer than bootstrap)", async () => {
  const { base, res } = makePayload();
  try {
    const m = JSON.parse(readFileSync(join(res, "frozen-manifest.json"), "utf8"));
    m.schemaVersion = 99;
    writeFileSync(join(res, "frozen-manifest.json"), JSON.stringify(m));
    await assert.rejects(() => call(res), /schemaVersion/);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

// --- [W17] verify-tier demotion -------------------------------------------

test("W17: second launch with stamp hit runs the fast pass (sizes only, mode:fast)", async () => {
  const { base, res, dataDir } = makePayload();
  try {
    const stampPath = frozenVerifyStampPath(dataDir);
    const opts = { stampPath, identity: payloadIdentity(res) };
    const first = await call(res, opts);
    assert.ok(first.ok);
    assert.equal(first.mode, "full"); // first launch: no stamp yet
    assert.ok(existsSync(stampPath), "full pass must write the stamp");

    const second = await call(res, opts);
    assert.ok(second.ok);
    assert.equal(second.mode, "fast"); // stamp hit → sizes only
    assert.equal(second.checked, 2);

    // The fast pass must not re-hash: corrupt bytes in place (SAME
    // size) — a full pass would catch it, a size-only pass cannot.
    writeFileSync(join(res, "backend", "jw", "frozen", "sd-jw", "sd-jw", "sd-jw.exe"), "EXEBYTEZ");
    const third = await call(res, opts);
    assert.ok(third.ok); // size matches → fast pass passes (by design)
    assert.equal(third.mode, "fast");
  } finally { rmSync(base, { recursive: true, force: true }); }
});

// [W31-⑤] The fast pass is window-parallel now (bounded Promise.all batches
// of 128 stats). Its per-file problem classification must stay identical to
// the serial shape: every kind (missing / not-a-file / size) is reported with
// the same path and fields, in manifest order within the window, and the
// byte count only sums clean files.
test("W31: windowed fast pass classifies problems exactly like the serial shape", async () => {
  const { base, res, dataDir } = makePayload();
  try {
    // Establish the stamp with a clean full pass.
    const opts = { stampPath: frozenVerifyStampPath(dataDir), identity: payloadIdentity(res) };
    const first = await call(res, opts);
    assert.ok(first.ok && first.mode === "full");

    // Sabotage one file per problem class on a >WINDOW manifest so the
    // windowed batches actually rotate.
    const manifestPath = join(res, "frozen-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.files = [];
    mkdirSync(join(res, "backend", "jw", "frozen", "sd-jw", "sd-jw", "many"), { recursive: true });
    for (let i = 0; i < 300; i += 1) {
      const bytes = Buffer.alloc(4, i % 256);
      writeFileSync(join(res, "backend", "jw", "frozen", "sd-jw", "sd-jw", "many", `f${i}.bin`), bytes);
      manifest.files.push({ path: `jw/many/f${i}.bin`, size: 4, sha256: sha(bytes) });
    }
    writeFileSync(manifestPath, JSON.stringify(manifest));
    // The fingerprint aggregates `onedirs` (still the 2-file fixture values),
    // so the original stamp stays valid and the sabotage below runs the
    // FAST tier directly — which is exactly the windowed path under test.

    // f0: missing (delete), f150: not-a-file (directory), f299: size drift.
    rmSync(join(res, "backend", "jw", "frozen", "sd-jw", "sd-jw", "many", "f0.bin"));
    rmSync(join(res, "backend", "jw", "frozen", "sd-jw", "sd-jw", "many", "f150.bin"));
    mkdirSync(join(res, "backend", "jw", "frozen", "sd-jw", "sd-jw", "many", "f150.bin"));
    writeFileSync(join(res, "backend", "jw", "frozen", "sd-jw", "sd-jw", "many", "f299.bin"), Buffer.alloc(5));

    const result = await verifyFrozenPayload(res, () => {}, opts);
    // Fast finds the drift → escalates to the full pass (W17 fail-safe), and
    // the FULL pass re-classifies every sabotaged file. Either tier's
    // classification must be identical, so asserting on the final result
    // pins the contract both paths share.
    assert.equal(result.mode, "full", "size drift on a stamped payload escalates to full (W17 fail-safe)");
    assert.ok(!result.ok, "problems must be reported");
    assert.equal(result.problems.length, 3);
    const byKind = Object.fromEntries(result.problems.map(p => [p.kind, p]));
    assert.equal(byKind.missing?.path, "jw/many/f0.bin");
    assert.equal(byKind["not-a-file"]?.path, "jw/many/f150.bin");
    assert.equal(byKind.size?.path, "jw/many/f299.bin");
    assert.equal(byKind.size?.expected, 4);
    assert.equal(byKind.size?.actual, 5);
    assert.equal(result.checked, 300);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test("W17: stamp identity mismatch (upgraded payload) falls back to full", async () => {
  const { base, res, dataDir } = makePayload();
  try {
    const stampPath = frozenVerifyStampPath(dataDir);
    const id1 = payloadIdentity(res);
    const first = await call(res, { stampPath, identity: id1 });
    assert.equal(first.mode, "full");

    // Simulate an upgrade: same manifest, new version.json identity.
    writeFileSync(join(res, "version.json"), JSON.stringify({ repoCommit: "def456", builtAt: "2026-11-27T00:00:00Z" }));
    const id2 = payloadIdentity(res);
    assert.notEqual(id1, id2);
    const second = await call(res, { stampPath, identity: id2 });
    assert.equal(second.mode, "full", "changed identity must not trust the old stamp");
    assert.ok(second.ok);
    // And the stamp is rewritten with the NEW identity.
    const stamped = JSON.parse(readFileSync(stampPath, "utf8"));
    assert.equal(stamped.identity, id2);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test("W17: size drift on a stamped payload escalates to full (hash decides)", async () => {
  const { base, res, dataDir } = makePayload();
  try {
    const stampPath = frozenVerifyStampPath(dataDir);
    const opts = { stampPath, identity: payloadIdentity(res) };
    assert.equal((await call(res, opts)).mode, "full");

    // Tamper: append bytes — size drift.
    appendFileSync(join(res, "backend", "jw", "frozen", "sd-jw", "sd-jw", "sd-jw.exe"), "X");
    const logs = [];
    const second = await verifyFrozenPayload(res, (l) => logs.push(l), opts);
    assert.equal(second.mode, "full", "size drift must escalate to the full pass");
    assert.ok(!second.ok);
    assert.equal(second.problems[0].kind, "size");
    assert.match(logs.join(" "), /escalating to full pass/);
    // FAILED full pass must not refresh the stamp.
    const stamped = JSON.parse(readFileSync(stampPath, "utf8"));
    assert.equal(stamped.identity, opts.identity);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test("W17: FAILED full pass never writes a stamp (fresh dataDir)", async () => {
  const { base, res, dataDir } = makePayload();
  try {
    const stampPath = frozenVerifyStampPath(dataDir);
    rmSync(join(res, "backend", "jw", "frozen", "sd-jw", "sd-jw", "_internal", "data.bin"));
    const v = await call(res, { stampPath, identity: payloadIdentity(res) });
    assert.ok(!v.ok);
    assert.equal(v.mode, "full");
    assert.ok(!existsSync(stampPath), "a failed pass must not stamp");
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test("W17: stamp write mkdirs its parent (first launch has no <dataDir>\\envs yet)", async () => {
  const { base, res, dataDir } = makePayload();
  try {
    const stampPath = frozenVerifyStampPath(dataDir);
    assert.ok(!existsSync(dirname(stampPath)), "fixture: dataDir\\envs does not exist yet");
    const v = await call(res, { stampPath, identity: payloadIdentity(res) });
    assert.ok(v.ok);
    assert.equal(v.mode, "full");
    assert.ok(existsSync(stampPath), "the write must mkdir <dataDir>\\envs on demand");
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test("W17: null identity (no version.json) never stamps — degraded but correct", async () => {
  const { base, res, dataDir } = makePayload();
  try {
    rmSync(join(res, "version.json"));
    const stampPath = frozenVerifyStampPath(dataDir);
    assert.equal(payloadIdentity(res), null);
    const first = await call(res, { stampPath, identity: null });
    assert.equal(first.mode, "full");
    const second = await call(res, { stampPath, identity: null });
    assert.equal(second.mode, "full", "without an identity the stamp can never hit");
    assert.ok(!existsSync(stampPath), "and no stamp is written");
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test("W17: unreadable/garbage stamp fails safe to the full pass", async () => {
  const { base, res, dataDir } = makePayload();
  try {
    const stampPath = frozenVerifyStampPath(dataDir);
    mkdirSync(dirname(stampPath), { recursive: true });
    writeFileSync(stampPath, "{ not json", "utf8");
    const v = await call(res, { stampPath, identity: payloadIdentity(res) });
    assert.ok(v.ok);
    assert.equal(v.mode, "full", "a corrupt stamp must demote to full, never skip");
    // And the successful full pass heals the stamp in place.
    const stamped = JSON.parse(readFileSync(stampPath, "utf8"));
    assert.equal(stamped.schemaVersion, 1);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

