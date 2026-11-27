// [W29] frozen-verify parallel full-pass tests: worker pool vs serial
// classification parity, pool-size clamp, and the small-manifest serial
// path. Uses a tiny synthetic manifest under a temp dir — the real
// payload is too big for a unit test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { verifyFrozenPayload } from "../src/frozen-verify.ts";

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** Build a synthetic payload: rootKey dirs with N files, one manifest. */
function buildPayload(root: string, count: number): { resDir: string } {
  const resDir = join(root, "res-" + count);
  // resolveEntry maps jw/... under backend/jw/frozen/sd-jw/sd-jw and
  // services/... under envs-template/frozen/sd-services/sd-services.
  const jwDir = join(resDir, "backend", "jw", "frozen", "sd-jw", "sd-jw");
  const svcsDir = join(resDir, "envs-template", "frozen", "sd-services", "sd-services");
  mkdirSync(jwDir, { recursive: true });
  mkdirSync(svcsDir, { recursive: true });
  const files: { path: string; size: number; sha256: string }[] = [];
  for (let i = 0; i < count; i++) {
    const content = `payload-${i}-`.repeat(20);
    const rel = `pkg/file-${i}.py`;
    const target = i % 2 === 0 ? join(jwDir, rel) : join(svcsDir, rel);
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, content, "utf8");
    files.push({
      path: (i % 2 === 0 ? "jw/" : "services/") + rel,
      size: Buffer.byteLength(content),
      sha256: sha256(content),
    });
  }
  writeFileSync(join(resDir, "frozen-manifest.json"), JSON.stringify({
    schemaVersion: 1,
    onedirs: {
      jw: { fileCount: Math.ceil(count / 2), totalBytes: files.filter(f => f.path.startsWith("jw/")).reduce((s, f) => s + f.size, 0) },
      services: { fileCount: Math.floor(count / 2), totalBytes: files.filter(f => f.path.startsWith("services/")).reduce((s, f) => s + f.size, 0) },
    },
    files,
  }), "utf8");
  return { resDir };
}

test("parallel full pass (>=64 files) classifies exactly like the manifest", async () => {
  const root = mkdtempSync(join(tmpdir(), "frozen-verify-p-"));
  try {
    const { resDir } = buildPayload(root, 100); // >=64 → worker pool path
    const lines: string[] = [];
    const verdict = await verifyFrozenPayload(resDir, (l: string) => lines.push(l), {});
    assert.equal(verdict.ok, true);
    assert.equal(verdict.checked, 100);
    assert.equal(verdict.mode, "full"); // no stamp → full pass
    assert.equal(verdict.problems.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("parallel pass reports corruption (hash mismatch) with the right file", async () => {
  const root = mkdtempSync(join(tmpdir(), "frozen-verify-c-"));
  try {
    const { resDir } = buildPayload(root, 80);
    // Corrupt one file: same size, different bytes.
    const victim = join(resDir, "backend", "jw", "frozen", "sd-jw", "sd-jw", "pkg", "file-0.py");
    const orig = Buffer.from(`payload-0-`.repeat(20));
    const flipped = Buffer.from(orig.map(b => b === 0x70 ? 0x71 : b)); // 'p'→'q' keeps length
    writeFileSync(victim, flipped);
    const verdict = await verifyFrozenPayload(resDir, () => {}, {});
    assert.equal(verdict.ok, false);
    assert.equal(verdict.problems.length, 1);
    assert.equal(verdict.problems[0].kind, "hash");
    assert.equal(verdict.problems[0].path, "jw/pkg/file-0.py");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("parallel pass reports missing and size-drift files", async () => {
  const root = mkdtempSync(join(tmpdir(), "frozen-verify-s-"));
  try {
    const { resDir } = buildPayload(root, 70);
    const missingFile = join(resDir, "backend", "jw", "frozen", "sd-jw", "sd-jw", "pkg", "file-2.py");
    rmSync(missingFile);
    const grown = join(resDir, "envs-template", "frozen", "sd-services", "sd-services", "pkg", "file-1.py");
    writeFileSync(grown, "extra-bytes-appended", { flag: "a" });
    const verdict = await verifyFrozenPayload(resDir, () => {}, {});
    assert.equal(verdict.ok, false);
    assert.equal(verdict.problems.length, 2);
    const kinds = verdict.problems.map(p => p.kind).sort();
    assert.deepEqual(kinds, ["missing", "size"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("small manifest (<64 files) stays on the serial path and still verifies", async () => {
  const root = mkdtempSync(join(tmpdir(), "frozen-verify-sm-"));
  try {
    const { resDir } = buildPayload(root, 10); // <64 → serial
    const verdict = await verifyFrozenPayload(resDir, () => {}, {});
    assert.equal(verdict.ok, true);
    assert.equal(verdict.checked, 10);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stamp round-trip: full pass writes the stamp, second call goes fast", async () => {
  const root = mkdtempSync(join(tmpdir(), "frozen-verify-st-"));
  try {
    const { resDir } = buildPayload(root, 100);
    const stampPath = join(root, "envs", ".frozen-verified");
    const identity = "test-identity@2026-11-27";
    const first = await verifyFrozenPayload(resDir, () => {}, { stampPath, identity });
    assert.equal(first.mode, "full");
    assert.equal(first.ok, true);
    // Stamp written by the parallel pass too (W17 discipline unchanged).
    const second = await verifyFrozenPayload(resDir, () => {}, { stampPath, identity });
    assert.equal(second.mode, "fast");
    assert.equal(second.ok, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
