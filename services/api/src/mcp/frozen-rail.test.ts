// Copyright (C) 2026 Huawei Technologies Co., Ltd
// SPDX-License-Identifier: Apache-2.0
// [D3 P2-2] Frozen-rail spawn contract tests: the paper/evolve/MCP
// command resolution prefers the sd-services onedir when present, and
// SD_SD_SERVICES_FREEZE=0 forces the venv rail (verification window).
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTest } from "../../../../test/support/tagged/compat.mjs";
const { test } = createTest(import.meta.url, { tags: ["category:ut", "os:windows", "os:linux", "os:macos", "arch:amd64", "arch:arm64"] });
import { resolveMcpPython } from "./node-client.ts";

function makeDataDir(withFrozen: boolean): string {
  const root = join(tmpdir(), `sd-p2-2-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  if (withFrozen) {
    // the P2-5 assemble layout: <dataDir>/frozen/sd-services/sd-services/sd-services.exe
    const exe = join(root, "frozen", "sd-services", "sd-services", "sd-services.exe");
    mkdirSync(join(root, "frozen", "sd-services", "sd-services"), { recursive: true });
    writeFileSync(exe, "");
  } else {
    mkdirSync(root, { recursive: true });
  }
  return root;
}

test("resolveMcpPython prefers the frozen sd-services exe from the data dir", () => {
  const dataDir = makeDataDir(true);
  try {
    const resolved = resolveMcpPython({ SD_SD_SERVICES_FREEZE: undefined, ...process.env, SCIENCE_AGENT_GATEWAY_PYTHON_PATH: "" } as NodeJS.ProcessEnv, dataDir);
    assert.match(resolved, /frozen[\\/]sd-services[\\/]sd-services[\\/]sd-services\.exe$/);
  } finally {
    rmSync(join(dataDir, "frozen"), { recursive: true, force: true });
  }
});

test("SD_SD_SERVICES_FREEZE=0 forces the venv rail (dual-rail window)", () => {
  const dataDir = makeDataDir(true);
  try {
    // venv rail with no venv present and no PATH python guarantee:
    // the resolver must NOT return the frozen exe; it either finds a
    // venv interpreter or throws. Both outcomes prove the rail switch.
    let threw = false;
    let resolved = "";
    try {
      resolved = resolveMcpPython({ ...process.env, SCIENCE_AGENT_GATEWAY_PYTHON_PATH: "", SD_SD_SERVICES_FREEZE: "0" } as NodeJS.ProcessEnv, dataDir);
    } catch {
      threw = true;
    }
    assert.ok(threw || !resolved.includes("frozen"), "freeze=0 must not resolve the frozen exe");
  } finally {
    rmSync(join(dataDir, "frozen"), { recursive: true, force: true });
  }
});

test("SCIENCE_AGENT_SD_SERVICES_EXE explicit override wins over the layout probe", () => {
  const dataDir = makeDataDir(false);
  const explicit = join(tmpdir(), `sd-explicit-${Date.now()}.exe`);
  writeFileSync(explicit, "");
  try {
    const resolved = resolveMcpPython({ ...process.env, SCIENCE_AGENT_GATEWAY_PYTHON_PATH: "", SCIENCE_AGENT_SD_SERVICES_EXE: explicit } as NodeJS.ProcessEnv, dataDir);
    assert.equal(resolved, explicit);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(explicit, { force: true });
  }
});
