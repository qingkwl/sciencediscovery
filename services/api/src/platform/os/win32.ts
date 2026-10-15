// Copyright (C) 2026-2026 Huawei Technologies Co., Ltd
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { spawn, spawnSync } from "node:child_process";
import { rename } from "node:fs/promises";

import type { OsAdaptation, RestrictToOwnerOptions, SecretProtector } from "./types.js";

/**
 * Windows has no POSIX permission bits: Node's chmod only toggles the
 * read-only attribute, leaving token files world-readable within the profile.
 * The NTFS equivalent of 0600 is an ACL limited to the current user:
 * strip inheritance, then grant that principal full control. icacls ships
 * with Windows, so no dependency is introduced.
 */

let cachedPrincipal: string | undefined;

/** "domain\user" for the current process, via whoami (handles domain accounts). */
export function currentUserPrincipal(): string {
  if (cachedPrincipal) return cachedPrincipal;
  const result = spawnSync("whoami", [], { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`whoami failed (${result.status}): ${result.stderr.trim()}`);
  }
  cachedPrincipal = result.stdout.trim();
  return cachedPrincipal;
}

function icaclsArgs(path: string, options?: RestrictToOwnerOptions): string[] {
  // (OI)(CI) lets a directory pass the restriction on to future children;
  // a plain file takes a direct full-control grant.
  const grant = options?.directory ? `${currentUserPrincipal()}:(OI)(CI)F` : `${currentUserPrincipal()}:F`;
  return [path, "/inheritance:r", "/grant:r", grant];
}

function assertIcaclsOk(status: number | null, output: string): void {
  if (status !== 0) throw new Error(`icacls failed (${status ?? "signal"}): ${output.trim()}`);
}

// --- at-rest secret wrapping via DPAPI (F9) -----------------------------------
//
// Windows ships no Node binding for CryptProtectData, and the repo's
// allowBuilds policy deliberately avoids native addons (0.6). The system
// PowerShell 5.1 exposes ProtectedData on .NET Framework out of the box, so a
// short-lived child process — same zero-dependency shape as whoami/icacls
// above — does the wrap. The call happens once at startup, so the process
// spawn cost is not on any hot path.

/** Every CryptProtectData blob starts with this 20-byte version header. */
const DPAPI_BLOB_PREFIX = Buffer.from([
  0x01, 0x00, 0x00, 0x00, 0xd0, 0x8c, 0x9d, 0xdf, 0x01, 0x15, 0xd1, 0x11,
  0x8c, 0x7a, 0x00, 0xc0, 0x4f, 0xc2, 0x97, 0xeb,
]);

/** Binds the blob to this product's use: the same user's other DPAPI blobs
 * (and vice versa) do not decrypt interchangeably. */
const SECRET_PROTECTOR_ENTROPY = "sciencediscovery:model-secrets";

function protectedDataScript(direction: "protect" | "unprotect"): string {
  const call = direction === "protect" ? "Protect" : "Unprotect";
  return [
    "$ErrorActionPreference = 'Stop'",
    "[Console]::OutputEncoding = [Text.Encoding]::UTF8",
    "try { Add-Type -AssemblyName System.Security } catch {}",
    "$in = [Console]::In.ReadToEnd().Trim()",
    "$bytes = [Convert]::FromBase64String($in)",
    `$entropy = [Text.Encoding]::UTF8.GetBytes('${SECRET_PROTECTOR_ENTROPY}')`,
    `$out = [Security.Cryptography.ProtectedData]::${call}($bytes, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)`,
    "[Convert]::ToBase64String($out)",
  ].join("\n");
}

/**
 * Run one ProtectedData operation. The script travels as an -EncodedCommand
 * (UTF-16LE base64) to stay out of quoting trouble; the payload travels on
 * stdin as base64 so secret bytes never appear in a process command line.
 */
async function runProtectedData(direction: "protect" | "unprotect", payload: Buffer): Promise<Buffer> {
  const encodedScript = Buffer.from(protectedDataScript(direction), "utf16le").toString("base64");
  const result = await new Promise<{ stdout: string; stderr: string; status: number | null }>((resolvePromise, rejectPromise) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-EncodedCommand", encodedScript],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", rejectPromise);
    child.once("close", (status) => resolvePromise({ stdout, stderr, status }));
    child.stdin.write(payload.toString("base64"));
    child.stdin.end();
  });
  if (result.status !== 0) {
    const detail = result.stderr.trim().split("\n").filter(Boolean).pop() ?? "unknown error";
    throw new Error(`ProtectedData ${direction} failed (${result.status ?? "signal"}): ${detail}`);
  }
  const out = result.stdout.trim();
  if (!out) throw new Error(`ProtectedData ${direction} returned no output`);
  return Buffer.from(out, "base64");
}

export const win32SecretProtector: SecretProtector = {
  wrapsAtRest: true,
  isWrapped(bytes) {
    return bytes.length >= DPAPI_BLOB_PREFIX.length && bytes.subarray(0, DPAPI_BLOB_PREFIX.length).equals(DPAPI_BLOB_PREFIX);
  },
  wrap(plain) {
    return runProtectedData("protect", plain);
  },
  unwrap(wrapped) {
    return runProtectedData("unprotect", wrapped);
  },
};

export const win32Adaptation: OsAdaptation = {
  secretProtector: win32SecretProtector,
  async restrictToOwner(path, options) {
    const args = icaclsArgs(path, options);
    await new Promise<void>((resolvePromise, rejectPromise) => {
      const child = spawn("icacls", args, { windowsHide: true });
      let output = "";
      child.stdout.on("data", (chunk) => { output += chunk; });
      child.stderr.on("data", (chunk) => { output += chunk; });
      child.once("error", rejectPromise);
      child.once("close", (status) => {
        try {
          assertIcaclsOk(status, output);
          resolvePromise();
        } catch (error) {
          rejectPromise(error);
        }
      });
    });
  },
  restrictToOwnerSync(path, options) {
    const result = spawnSync("icacls", icaclsArgs(path, options), { encoding: "utf8" });
    if (result.error) throw result.error;
    assertIcaclsOk(result.status, `${result.stdout}${result.stderr}`);
  },
  async renameReplace(source, destination) {
    // AV scanners and search indexers briefly hold freshly written files;
    // MoveFileEx-with-replace then reports EPERM/EACCES/EBUSY. Back off and
    // retry: the window is tens of milliseconds, so ~1.5s of patience is ample.
    const retryable = new Set(["EPERM", "EACCES", "EBUSY"]);
    let lastError: unknown;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        return await rename(source, destination);
      } catch (error) {
        lastError = error;
        if (!retryable.has((error as NodeJS.ErrnoException).code ?? "")) throw error;
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 50 + attempt * 25));
      }
    }
    throw lastError;
  },
};
