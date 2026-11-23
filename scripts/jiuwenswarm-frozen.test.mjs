// Copyright (C) 2026 Huawei Technologies Co., Ltd
// SPDX-License-Identifier: Apache-2.0
// [D3 P1-3] Frozen-exe spawn contract tests: resolveVenvEntry's frozen
// short-circuit, the SD_JW_FREEZE=0 venv rail, and the entry-name map.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTest } from "../test/support/tagged/compat.mjs";
const { test } = createTest(import.meta.url, { tags: ["category:ut", "os:windows", "os:linux", "os:macos", "arch:amd64", "arch:arm64"] });
import { jwConfig, frozenJwExe, resolveVenvEntry } from "./jiuwenswarm.mjs";

function makeTree(temporary, { withFrozen = true, withVenv = true } = {}) {
  // <temporary> plays cfg.root (.sciencediscovery-data/jiuwenswarm):
  // frozen payload at <root>/frozen/sd-jw/sd-jw.exe (P1-5 layout).
  mkdirSync(join(temporary, "frozen/sd-jw"), { recursive: true });
  if (withFrozen) {
    writeFileSync(join(temporary, "frozen/sd-jw/sd-jw.exe"), "");
  }
  if (withVenv) {
    mkdirSync(join(temporary, "src/.venv/Scripts"), { recursive: true });
    writeFileSync(join(temporary, "src/.venv/Scripts/python.exe"), "");
  }
  return join(temporary, "src/.venv");
}

test("frozen onedir short-circuits the venv entry resolution", () => {
  const temporary = join(tmpdir(), "sd-frozen-resolve-");
  const root = `${temporary}-${Date.now()}`;
  const venv = makeTree(root);
  try {
    const cfg = jwConfig({ JIUWENSWARM_ROOT: root });
    const exe = frozenJwExe(cfg);
    assert.ok(exe, "frozen exe not resolved from the P1-5 payload layout");
    assert.match(exe, /frozen[\\/]sd-jw[\\/]sd-jw\.exe$/);
    const spec = resolveVenvEntry(venv, "jiuwenswarm-start");
    assert.equal(spec.exe, exe);
    assert.deepEqual(spec.args, ["start"]);
    assert.equal(spec.frozen, true);
  } finally {
    // rmSync not imported here on purpose? No — keep the temp tree for
    // failure forensics; CI tmp is ephemeral.
  }
});

test("entry name maps jiuwenswarm-<x> -> <x> through the dispatcher", () => {
  const root = `${join(tmpdir(), "sd-frozen-name-")}-${Date.now()}`;
  const venv = makeTree(root);
  for (const [script, entry] of [
    ["jiuwenswarm-start", "start"],
    ["jiuwenswarm-init", "init"],
    ["jiuwenswarm-stop", "stop"],
  ]) {
    const spec = resolveVenvEntry(venv, script);
    assert.deepEqual(spec.args, [entry], `${script} should dispatch to ${entry}`);
  }
});

test("SD_JW_FREEZE=0 forces the venv rail (dual-rail verification window)", () => {
  const root = `${join(tmpdir(), "sd-frozen-off-")}-${Date.now()}`;
  const venv = makeTree(root, { withFrozen: true, withVenv: true });
  const previous = process.env.SD_JW_FREEZE;
  process.env.SD_JW_FREEZE = "0";
  try {
    const cfg = jwConfig({ JIUWENSWARM_ROOT: root });
    assert.equal(frozenJwExe(cfg), undefined, "freeze off must disable the frozen exe");
    // venv rail: no entry_points.txt in this synthetic tree -> trampoline
    // fallback (exe may not exist; spec shape is what matters).
    const spec = resolveVenvEntry(venv, "jiuwenswarm-start");
    assert.ok(spec.exe, "venv rail must still resolve a spawn spec");
    assert.equal(spec.frozen, undefined);
  } finally {
    if (previous === undefined) delete process.env.SD_JW_FREEZE;
    else process.env.SD_JW_FREEZE = previous;
  }
});
