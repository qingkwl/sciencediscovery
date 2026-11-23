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
// Returns null when the payload ships no manifest (pre-D3 builds, or a
// dual-rail payload without frozen onedirs) — absence is not an error
// there. The verify shares the sha256 implementation shape with
// scripts/lib/frozen-manifest.mjs (kept separate: the bootstrap must
// not import from the build scripts' module graph).

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

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

/** Verify the frozen payload against its build-time manifest.
 *  Returns null when no manifest ships (nothing to verify). */
export async function verifyFrozenPayload(
  resourcesPath: string,
  log: (line: string) => void,
): Promise<FrozenVerifyResult | null> {
  const manifestPath = join(resourcesPath, "frozen-manifest.json");
  if (!existsSync(manifestPath)) return null;
  const manifest: FrozenManifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.schemaVersion !== 1) {
    throw new Error(`frozen-manifest.json schemaVersion ${manifest.schemaVersion} not understood (bootstrap is older than the payload; reinstall)`);
  }
  const started = Date.now();
  const problems: FrozenVerifyProblem[] = [];
  for (const entry of manifest.files) {
    const full = resolveEntry(resourcesPath, entry.path);
    let st;
    try {
      st = await stat(full);
    } catch {
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
  const ok = problems.length === 0;
  const faces = Object.entries(manifest.onedirs).map(([k, v]) => `${k}=${v.fileCount}`).join(", ");
  log(`[perf] frozen integrity: ${ok ? "OK" : "FAILED"} — ${manifest.files.length} files (${faces}) in ${Date.now() - started}ms`);
  return { ok, problems, checked: manifest.files.length };
}
