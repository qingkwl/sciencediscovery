// Copyright (C) 2026-2026 Huawei Technologies Co., Ltd
// SPDX-License-Identifier: Apache-2.0
// [D3 P3-1] Frozen-payload integrity manifest.
//
// The A6 pyc-budget gate guarded the venv era's bytecode completeness
// (W25: compileall silently redirecting .pyc outside the payload). The
// frozen era moves the risk surface: bytecode lives in the PYZ archives
// inside the exes and the onedirs ship thousands of LOOSE files (DLLs,
// data trees, dist-infos). The completeness contract becomes:
//
//   build time:  snapshot every file of every frozen onedir into
//                frozen-manifest.json (path, size, sha256), shipped in
//                the payload
//   first run:   the bootstrap verifies the manifest against the tree
//                (P3-3) — a deleted/corrupted/truncated file fails
//                BEFORE the first spawn, not as a cryptic loader error
//   injection:   the snapshot function must notice a missing file
//                (test/frozen-manifest.test.mjs) and a modified one
//
// The manifest deliberately does NOT cover the venv rails (the
// dual-rail window keeps the old A6 whole-tree gate active until P3-3
// retires it) nor NSIS-compressed payloads (the installer's own CRC
// layer covers transport).

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const HASH_CHUNK = 1024 * 1024;

async function sha256File(path) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

/** Snapshot one frozen onedir into manifest entries.
 *  `rootKey` is the manifest-side name of the tree (e.g. "jw",
 *  "services"); entry paths are `<rootKey>/<relpath>` with forward
 *  slashes so the manifest is platform-neutral. */
export async function snapshotOnedir(rootKey, onedirDir) {
  const entries = [];
  async function walk(dir) {
    for (const ent of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, ent.name);
      if (ent.isDirectory()) {
        await walk(full);
      } else if (ent.isFile()) {
        const { size } = await stat(full);
        const rel = relative(onedirDir, full).split(sep).join("/");
        entries.push({
          path: `${rootKey}/${rel}`,
          size,
          sha256: await sha256File(full),
        });
      }
    }
  }
  await walk(onedirDir);
  return entries;
}

/** Build the combined manifest for every onedir present. `dirs` maps
 *  rootKey -> absolute onedir directory. Missing dirs are SKIPPED
 *  (the dual-rail window may build only one tree). */
export async function buildFrozenManifest(dirs, { now = () => new Date().toISOString() } = {}) {
  const files = [];
  const onedirs = {};
  for (const [key, dir] of Object.entries(dirs)) {
    try {
      const entries = await snapshotOnedir(key, dir);
      files.push(...entries);
      onedirs[key] = {
        fileCount: entries.length,
        totalBytes: entries.reduce((n, e) => n + e.size, 0),
      };
    } catch (e) {
      // A missing onedir during the dual-rail window is not an error:
      // the jw tree may be frozen while services still ships venv-only.
      if (e.code !== "ENOENT") throw e;
    }
  }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return {
    schemaVersion: 1,
    generatedAt: now(),
    onedirs,
    files,
  };
}

/** Verify a manifest against the tree on disk. Returns per-file verdicts;
 *  the caller decides fail/advisory from them (the bootstrap's P3-3
 *  integrity probe hard-fails on any problem; assemble's usage is
 *  self-check right after writing the snapshot).
 *  `resolveEntry` maps a manifest entry path to an absolute disk path. */
export async function verifyFrozenManifest(manifest, resolveEntry) {
  const problems = [];
  for (const entry of manifest.files) {
    const full = resolveEntry(entry.path);
    let st;
    try {
      st = await stat(full);
    } catch (e) {
      problems.push({ path: entry.path, kind: "missing" });
      continue;
    }
    if (!st.isFile()) {
      problems.push({ path: entry.path, kind: "not-a-file" });
      continue;
    }
    if (st.size !== entry.size) {
      problems.push({ path: entry.path, kind: "size", expected: entry.size, actual: st.size });
      continue;
    }
    const digest = await sha256File(full);
    if (digest !== entry.sha256) {
      problems.push({ path: entry.path, kind: "hash", expected: entry.sha256, actual: digest });
    }
  }
  return { problems, checked: manifest.files.length };
}
