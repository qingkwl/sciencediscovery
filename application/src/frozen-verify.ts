// Copyright (C) 2026-2026 Huawei Technologies Co., Ltd
// SPDX-License-Identifier: Apache-2.0
// [D3 P3-3] First-run verification of the frozen payload.
//
// assemble 5.5c writes frozen-manifest.json next to the onedirs it
// snapshots (path+size+sha256 per file). This module re-verifies that
// manifest against the INSTALLED tree at bootstrap, before the first
// spawn: a deleted/truncated/corrupted file (broken install, AV
// quarantine, a disk error) fails HERE with a readable message instead
// of surfacing as a loader traceback deep inside the frozen exe.
//
// Returns a mode:"none" verdict when the payload ships no manifest
// (pre-D3 builds, or a dual-rail payload without frozen onedirs) —
// absence is not an error there. The verify shares the sha256
// implementation shape with
// scripts/lib/frozen-manifest.mjs (kept separate: the bootstrap must
// not import from the build scripts' module graph).
//
// [W17] Verify-tier demotion (2026-11-26). The full pass reads all
// 839.5MB (14,071 files) serially — 147.7s measured warm on the field
// machine — and it ran on EVERY launch (it sits before the
// needsUnpack short-circuit, so no path could skip it). That turned
// every frozen-rail start into a ~2.5min stall: the A/B experiment
// (D:/CodeFile/sd-perf-ab, W17) isolated it as the dominant cost of
// the frozen rail vs the venv rail. Fix: a verify stamp keyed on the
// payload identity (same shape bootstrap's unpack stamp uses). First
// launch (or a changed payload — upgrade/reinstall/identity shift)
// runs the full hash and writes the stamp; every later launch runs a
// stat+size pass only (<1s warm) and falls back to the full hash when
// a size disagrees (tamper/corruption/drift). Deleting the stamp
// simply re-triggers the full pass: the mechanism fails safe, never
// open.

import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { Worker } from "node:worker_threads";
import { availableParallelism, tmpdir } from "node:os";
import { dirname, join } from "node:path";

export interface FrozenVerifyProblem {
  path: string;
  kind: "missing" | "not-a-file" | "size" | "hash";
  expected?: number | string;
  actual?: number | string;
}

export interface FrozenVerifyResult {
  ok: boolean;
  problems: FrozenVerifyProblem[];
  checked: number;
  /** [W17] Which tier actually ran: "full" hashed every file, "fast"
   *  checked sizes only (stamp hit), "none" skipped everything (no
   *  manifest). Lets the perf log answer "why was this start fast". */
  mode: "full" | "fast" | "none";
}

interface FrozenManifestEntry {
  path: string;
  size: number;
  sha256: string;
}

interface FrozenManifest {
  schemaVersion: number;
  onedirs: Record<string, { fileCount: number; totalBytes: number }>;
  files: FrozenManifestEntry[];
}

/** [W17] The stamp record: "this payload was fully verified here".
 *  `identity` must be the caller's payloadIdentity() string (see
 *  bootstrap.payloadIdentity — commit@builtAt); the manifest's own
 *  generatedAt/fileCount/totalBytes ride along as a second factor so
 *  two builds that somehow share a version.json identity but ship
 *  different payloads still split the stamp. */
export interface FrozenVerifyStamp {
  schemaVersion: 1;
  identity: string;
  manifestFingerprint: string;
  verifiedFileCount: number;
  verifiedBytes: number;
  verifiedAt: string;
}

/** Manifest-derived second factor for the stamp (identity alone keys on
 *  version.json; the fingerprint keys on the manifest content). */
function manifestFingerprint(manifest: FrozenManifest): string {
  const { generatedAt = "", fileCount, totalBytes } = summarize(manifest);
  return `${generatedAt}:${fileCount}:${totalBytes}`;
}

function summarize(manifest: FrozenManifest): {
  generatedAt?: string;
  fileCount: number;
  totalBytes: number;
} {
  // onedirs is the authoritative aggregate the assembler writes; fall
  // back to counting the files array when a future schema drops it.
  let fileCount = 0;
  let totalBytes = 0;
  for (const v of Object.values(manifest.onedirs ?? {})) {
    fileCount += v.fileCount;
    totalBytes += v.totalBytes;
  }
  if (fileCount === 0 && Array.isArray(manifest.files)) {
    for (const f of manifest.files) { fileCount += 1; totalBytes += f.size; }
  }
  return { generatedAt: (manifest as { generatedAt?: unknown }).generatedAt as string | undefined, fileCount, totalBytes };
}

/** The manifest's entry paths are `<rootKey>/<rel>`; the payload maps
 *  rootKey → its onedir directory. Mirrors assemble 5.5c's staging
 *  (backend/jw/frozen/sd-jw/sd-jw resp. envs-template/frozen/
 *  sd-services/sd-services) under the install resources root. */
function resolveEntry(resourcesPath: string, entryPath: string): string {
  const [rootKey, ...rest] = entryPath.split("/");
  const base = rootKey === "jw"
    ? join(resourcesPath, "backend", "jw", "frozen", "sd-jw", "sd-jw")
    : join(resourcesPath, "envs-template", "frozen", "sd-services", "sd-services");
  return join(base, ...rest);
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

/** [W17] Read the stamp; null when absent, unreadable, or schema-ahead
 *  (all treated as "no stamp" → full pass; fail-safe, never open). */
export function readFrozenVerifyStamp(stampPath: string): FrozenVerifyStamp | null {
  try {
    const raw = JSON.parse(readFileSync(stampPath, "utf8")) as Partial<FrozenVerifyStamp>;
    if (raw.schemaVersion !== 1 || typeof raw.identity !== "string") return null;
    return {
      schemaVersion: 1,
      identity: raw.identity,
      manifestFingerprint: typeof raw.manifestFingerprint === "string" ? raw.manifestFingerprint : "",
      verifiedFileCount: typeof raw.verifiedFileCount === "number" ? raw.verifiedFileCount : 0,
      verifiedBytes: typeof raw.verifiedBytes === "number" ? raw.verifiedBytes : 0,
      verifiedAt: typeof raw.verifiedAt === "string" ? raw.verifiedAt : "",
    };
  } catch {
    return null;
  }
}

/** [W17] Atomic stamp write (tmp + rename) — a half-written stamp must
 *  never read as valid (worst case: the NEXT start falls back to the
 *  full pass, which is exactly the safe direction). The stamp lives
 *  under <dataDir>\envs, which does not exist yet on the very first
 *  launch (verify runs at bootstrapPackaged entry, BEFORE the unpack
 *  creates it) — so the write mkdirs the parent: without it every
 *  first launch would fail the stamp write with ENOENT and never
 *  demote, silently keeping the 147.7s pass on EVERY launch (the bug
 *  W17 exists to fix). Best-effort: a read-only dataDir logs and moves
 *  on; the next start re-verifies. */
function writeFrozenVerifyStamp(stampPath: string, stamp: FrozenVerifyStamp, log: (line: string) => void): void {
  try {
    mkdirSync(dirname(stampPath), { recursive: true });
    const tmp = `${stampPath}.tmp`;
    writeFileSync(tmp, JSON.stringify(stamp, null, 2), "utf8");
    renameSync(tmp, stampPath);
  } catch (error) {
    log(`frozen-verify stamp write failed (next start will re-verify in full): ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** The full pass: stat + size + sha256 every manifest entry.
 *
 *  [W29] Parallelized (2026-11-27). The pre-W29 serial loop measured
 *  3.8s warm / 147.7s on the field machine's first cold run (839.5MB,
 *  14,071 files) — pure IO-latency bound on a mountain of ~60KB files.
 *  A worker_threads pool overlaps the reads: measured on the same
 *  payload, serial 3792ms → 4 workers 1592ms → 8 workers 1058ms →
 *  12 workers 905ms (diminishing past 8). 8 is the pool size (matches
 *  os.availableParallelism/2 clamped to [4,8] — small machines keep
 *  headroom, big ones stop at the knee). Workers are plain JS (the
 *  bootstrap must not import from the build graph — same discipline as
 *  the manifest helpers): written once to tmpdir and reused for the
 *  whole pass; each worker owns one file at a time (stat → size gate →
 *  stream+hash), so problem classification stays identical to the
 *  serial shape. Worker spawn failure falls back to the serial path —
 *  verification must never fail because the pool could not be created. */
async function verifyFull(
  resourcesPath: string,
  manifest: FrozenManifest,
  poolSize = defaultWorkerPoolSize(),
): Promise<{ problems: FrozenVerifyProblem[]; bytes: number }> {
  const tasks = manifest.files.map(entry => ({ entry, full: resolveEntry(resourcesPath, entry.path) }));
  // Small manifests (or a pool of 1) are not worth the worker spawn:
  // the serial path has lower fixed cost.
  if (poolSize <= 1 || tasks.length < 64) {
    return verifyFullSerial(resourcesPath, manifest);
  }
  const workerFile = writeVerifyWorker();
  if (workerFile === null) {
    return verifyFullSerial(resourcesPath, manifest);
  }
  const problems: FrozenVerifyProblem[] = [];
  let bytes = 0;
  let next = 0;
  let settled = 0;
  const pool: Worker[] = [];
  const terminatePool = (): void => {
    for (const w of pool) {
      try { void w.terminate(); } catch { /* already gone */ }
    }
  };
  try {
    await new Promise<void>(resolvePass => {
      const feed = (worker: Worker): void => {
        const i = next++;
        if (i >= tasks.length) {
          // No more work: a live worker keeps the event loop alive (its
          // message port never closes on its own) and would hang the
          // caller after the last task settles — terminate it.
          try { void worker.terminate(); } catch { /* already gone */ }
          if (settled === tasks.length) resolvePass();
          return;
        }
        const { entry, full } = tasks[i];
        worker.once("message", (m: {
          kind: "ok" | "missing" | "not-a-file" | "size" | "hash";
          expected?: number | string;
          actual?: number | string;
          bytes?: number;
        }) => {
          settled += 1;
          switch (m.kind) {
            case "ok":
              bytes += m.bytes ?? 0;
              break;
            case "missing":
              problems.push({ path: entry.path, kind: "missing" });
              break;
            case "not-a-file":
              problems.push({ path: entry.path, kind: "not-a-file" });
              break;
            case "size":
              problems.push({ path: entry.path, kind: "size", expected: m.expected, actual: m.actual });
              break;
            case "hash":
              problems.push({ path: entry.path, kind: "hash", expected: m.expected, actual: m.actual });
              break;
          }
          if (settled === tasks.length) {
            terminatePool();
            resolvePass();
          } else {
            feed(worker);
          }
        });
        worker.once("error", () => {
          // A crashed worker must not stall the pass: its task falls back
          // to inline verification on the main thread.
          settled += 1;
          void verifyOneSerial(full, entry).then(({ problem, size }) => {
            if (problem) problems.push(problem);
            bytes += size;
            if (settled === tasks.length) {
              terminatePool();
              resolvePass();
            }
          });
          // The pool shrank; remaining tasks still stream through the
          // other workers (feed() keeps being called by their messages).
        });
        worker.postMessage({ path: full, size: entry.size, sha256: entry.sha256 });
      };
      for (let i = 0; i < poolSize && i < tasks.length; i++) {
        const w = new Worker(workerFile);
        pool.push(w);
        feed(w);
      }
    });
  } finally {
    terminatePool();
    try { rmSyncQuiet(workerFile); } catch { /* best-effort */ }
  }
  return { problems, bytes };
}

/** [W29] Pool size: half the logical cores (hashing is CPU-light, the
 *  bottleneck is IO latency), clamped to [4, 8] — the measured knee of
 *  the curve. Fewer than 4 cores → still 4 (overlap is the point). */
function defaultWorkerPoolSize(): number {
  const cores = availableParallelismSafe();
  if (cores <= 0) return 1;
  return Math.max(4, Math.min(8, Math.ceil(cores / 2)));
}

function availableParallelismSafe(): number {
  try {
    return availableParallelism();
  } catch {
    return 0;
  }
}

/** [W29] Best-effort rm without importing rm (keep the import surface of
 *  this module tight; bootstrap pays for every module). */
function rmSyncQuiet(file: string): void {
  try { unlinkSyncWorkerSafe(file); } catch { /* ignore */ }
}
function unlinkSyncWorkerSafe(file: string): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require("node:fs") as typeof import("node:fs");
  fs.rmSync(file, { force: true });
}

/** [W29] The worker script (plain JS, CommonJS — worker_threads runs it
 *  outside the TS module graph). One task per message; classification
 *  mirrors verifyOneSerial exactly. Returns null when the scratch file
 *  cannot be written (tmpdir full/readonly) — caller falls back serial. */
function writeVerifyWorker(): string | null {
  const source = `
const { parentPort } = require("node:worker_threads");
const { createHash } = require("node:crypto");
const { createReadStream, statSync } = require("node:fs");
parentPort.on("message", ({ path, size, sha256 }) => {
  let st;
  try { st = statSync(path); } catch { parentPort.postMessage({ kind: "missing" }); return; }
  if (!st.isFile()) { parentPort.postMessage({ kind: "not-a-file" }); return; }
  if (st.size !== size) { parentPort.postMessage({ kind: "size", expected: size, actual: st.size }); return; }
  const h = createHash("sha256");
  const s = createReadStream(path);
  s.on("data", c => h.update(c));
  s.on("error", () => parentPort.postMessage({ kind: "missing" }));
  s.on("end", () => {
    const digest = h.digest("hex");
    if (digest === sha256) parentPort.postMessage({ kind: "ok", bytes: st.size });
    else parentPort.postMessage({ kind: "hash", expected: sha256, actual: digest });
  });
});
`;
  try {
    const file = join(tmpdir(), `sd-frozen-verify-${process.pid}.cjs`);
    writeFileSync(file, source, "utf8");
    return file;
  } catch {
    return null;
  }
}

/** [W29] Single-file serial verification (the fallback for crashed
 *  workers and small passes). Same classification as the worker. */
async function verifyOneSerial(full: string, entry: FrozenManifestEntry): Promise<{ problem: FrozenVerifyProblem | null; size: number }> {
  let st;
  try {
    st = await stat(full);
  } catch {
    return { problem: { path: entry.path, kind: "missing" }, size: 0 };
  }
  if (!st.isFile()) {
    return { problem: { path: entry.path, kind: "not-a-file" }, size: 0 };
  }
  if (st.size !== entry.size) {
    return { problem: { path: entry.path, kind: "size", expected: entry.size, actual: st.size }, size: 0 };
  }
  const digest = await sha256File(full);
  if (digest !== entry.sha256) {
    return { problem: { path: entry.path, kind: "hash", expected: entry.sha256, actual: digest }, size: 0 };
  }
  return { problem: null, size: st.size };
}

/** [W29] The serial full pass — pre-W29 behaviour, kept as the fallback
 *  (worker pool unavailable) and the small-manifest path. */
async function verifyFullSerial(
  resourcesPath: string,
  manifest: FrozenManifest,
): Promise<{ problems: FrozenVerifyProblem[]; bytes: number }> {
  const problems: FrozenVerifyProblem[] = [];
  let bytes = 0;
  for (const entry of manifest.files) {
    const { problem, size } = await verifyOneSerial(resolveEntry(resourcesPath, entry.path), entry);
    if (problem) problems.push(problem);
    else bytes += size;
  }
  return { problems, bytes };
}

/** [W17] The fast pass: stat + size only (no reads). Warm, 14k entries
 *  stat in well under a second. Any mismatch is reported as a problem
 *  so the caller escalates to the full pass — a size mismatch means
 *  tamper, corruption, or payload drift, and hashing decides which.
 *
 *  [W31-⑤] Parallelized with a bounded Promise.all window: the serial
 *  await-stat loop serialized one metadata syscall per file (measured
 *  832ms warm on 14,211 entries — 59µs/file of pure round-trip latency,
 *  not throughput). Batching the stats keeps libuv's thread pool fully
 *  fed and overlaps the round trips. The window is 128 (deeper windows
 *  buy nothing for metadata syscalls and balloon the promise queue);
 *  classification and problem shapes are byte-identical to the serial
 *  version. Measured on the same payload: 832ms → ~250ms. */
async function verifySizes(
  resourcesPath: string,
  manifest: FrozenManifest,
): Promise<{ problems: FrozenVerifyProblem[]; bytes: number }> {
  const problems: FrozenVerifyProblem[] = [];
  let bytes = 0;
  const WINDOW = 128;
  for (let start = 0; start < manifest.files.length; start += WINDOW) {
    const slice = manifest.files.slice(start, start + WINDOW);
    await Promise.all(slice.map(async entry => {
      const full = resolveEntry(resourcesPath, entry.path);
      let st;
      try {
        st = await stat(full);
      } catch {
        problems.push({ path: entry.path, kind: "missing" });
        return;
      }
      if (!st.isFile()) {
        problems.push({ path: entry.path, kind: "not-a-file" });
        return;
      }
      if (st.size !== entry.size) {
        problems.push({ path: entry.path, kind: "size", expected: entry.size, actual: st.size });
        return;
      }
      bytes += st.size;
    }));
  }
  return { problems, bytes };
}

/** Verify the frozen payload against its build-time manifest.
 *  Returns a mode:"none" verdict when no manifest ships (nothing to
 *  verify).
 *
 *  [W17] `stampPath` + `identity` demote repeat launches to a
 *  stat+size fast pass (write the stamp after a successful full pass;
 *  hit the fast pass while identity+fingerprint both match). Both are
 *  optional: legacy callers passing no stamp keep the always-full
 *  behaviour, and a null identity (no version.json) simply never
 *  stamps — degraded but correct. */
export async function verifyFrozenPayload(
  resourcesPath: string,
  log: (line: string) => void,
  options?: { stampPath?: string; identity?: string | null },
): Promise<FrozenVerifyResult> {
  const manifestPath = join(resourcesPath, "frozen-manifest.json");
  if (!existsSync(manifestPath)) {
    log("[perf] frozen integrity: no manifest (non-frozen payload) — skipped");
    return { ok: true, problems: [], checked: 0, mode: "none" };
  }
  const manifest: FrozenManifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.schemaVersion !== 1) {
    throw new Error(`frozen-manifest.json schemaVersion ${manifest.schemaVersion} not understood (bootstrap is older than the payload; reinstall)`);
  }
  const started = Date.now();
  const fingerprint = manifestFingerprint(manifest);
  const faces = Object.entries(manifest.onedirs).map(([k, v]) => `${k}=${v.fileCount}`).join(", ");

  // [W17] Tier 1: stamp hit → sizes-only fast pass.
  const stampPath = options?.stampPath;
  const identity = options?.identity ?? null;
  const stamp = stampPath ? readFrozenVerifyStamp(stampPath) : null;
  const stampValid = stamp !== null
    && identity !== null
    && stamp.identity === identity
    && stamp.manifestFingerprint === fingerprint;

  if (stampValid && stamp) {
    const { problems, bytes } = await verifySizes(resourcesPath, manifest);
    if (problems.length === 0) {
      log(`[perf] frozen integrity: OK (fast) — ${manifest.files.length} files, ${(bytes / 1e6).toFixed(1)}MB size-checked in ${Date.now() - started}ms (full pass stamped ${stamp.verifiedAt})`);
      return { ok: true, problems: [], checked: manifest.files.length, mode: "fast" };
    }
    // Size drift on a stamped payload: escalate — hash the full tree to
    // distinguish corruption/tamper from benign drift, then the stamp
    // refresh below keeps the next launch fast again.
    log(`[perf] frozen integrity: stamp hit but ${problems.length} size mismatch(es) — escalating to full pass`);
  }

  // [W17] Tier 2: the full pass (first run / changed payload / drift).
  const { problems, bytes } = await verifyFull(resourcesPath, manifest);
  const ok = problems.length === 0;
  log(`[perf] frozen integrity: ${ok ? "OK" : "FAILED"} — ${manifest.files.length} files (${faces}) in ${Date.now() - started}ms`);
  if (ok && stampPath && identity !== null) {
    writeFrozenVerifyStamp(stampPath, {
      schemaVersion: 1,
      identity,
      manifestFingerprint: fingerprint,
      verifiedFileCount: manifest.files.length,
      verifiedBytes: bytes,
      verifiedAt: new Date().toISOString(),
    }, log);
  }
  return { ok, problems, checked: manifest.files.length, mode: "full" };
}
