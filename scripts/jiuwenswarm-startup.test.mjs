// Copyright (C) 2026-2026 Huawei Technologies Co., Ltd
// Licensed under the Apache License, Version 2.0 (the "License");
// Tests for the F10.6 jiuwenswarm startup-chain hardening: bootstrap .env port
// parsing (the TCP probe source), the startup diagnostics file, and stderr
// tail truncation. Tagged os:windows-safe: pure helpers + temp dirs, no
// network, no python spawn.

import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  diag, jwConfig, parseInstanceEnvPorts, readInstancePorts, startupDiagPath, stderrTail,
} from "./jiuwenswarm.mjs";

test("parseInstanceEnvPorts reads the bootstrap .env jiuwenswarm-init writes", () => {
  const text = [
    "# Bootstrap .env for instance: sciencediscovery",
    "JIUWENSWARM_DATA_DIR=C:\\Users\\x\\.jiuwenswarm-instances\\sciencediscovery",
    "JIUWENSWARM_INSTANCE=sciencediscovery",
    "AGENT_SERVER_PORT=19092",
    "WEB_PORT=20000",
    "GATEWAY_PORT=20001",
    "FRONTEND_PORT=6173",
  ].join("\n");
  assert.deepEqual(parseInstanceEnvPorts(text), { gateway: 20001, web: 20000, agentServer: 19092 });
});

test("parseInstanceEnvPorts tolerates partial .env files and unrelated keys", () => {
  assert.deepEqual(
    parseInstanceEnvPorts("WEB_PORT=20012\n"),
    { gateway: undefined, web: 20012, agentServer: undefined },
  );
  assert.equal(parseInstanceEnvPorts("UNRELATED=1\nOTHER=2\n"), null);
  assert.equal(parseInstanceEnvPorts(""), null);
  assert.equal(parseInstanceEnvPorts(undefined), null);
});

test("parseInstanceEnvPorts anchors key names (no MY_GATEWAY_PORT false hit)", () => {
  assert.equal(parseInstanceEnvPorts("MY_GATEWAY_PORT=9999\nXGATEWAY_PORT=1\n"), null);
});

test("stderrTail collapses whitespace, passes short text, keeps the tail of long text", () => {
  assert.equal(stderrTail(""), "");
  assert.equal(stderrTail(undefined), "");
  assert.equal(stderrTail("Traceback (most recent\n  call last):\n  boom"), "Traceback (most recent call last): boom");
  const tail = stderrTail("x".repeat(1000), 600);
  assert.equal(tail.length, 601); // "…" + the last 600 chars
  assert.ok(tail.startsWith("…"));
  assert.ok(tail.endsWith("x"));
});

test("startupDiagPath lands in the jw root (packaged: %LOCALAPPDATA%\\ScienceDiscovery\\jiuwenswarm)", () => {
  const root = join("C:", "sd", "data", "jiuwenswarm");
  const cfg = jwConfig({ JIUWENSWARM_ROOT: root });
  assert.equal(startupDiagPath(cfg), join(root, "startup-diagnostics.log"));
});

test("diag appends timestamped lines to the diagnostics file", async () => {
  const root = await mkdtemp(join(tmpdir(), "jw-diag-"));
  try {
    const cfg = jwConfig({ JIUWENSWARM_ROOT: root });
    await diag(cfg, "start begin: instance=test");
    await diag(cfg, "probe #1: gateway 20001 not listening after 15s");
    const lines = (await readFile(startupDiagPath(cfg), "utf8")).trimEnd().split(/\r?\n/);
    assert.equal(lines.length, 2);
    assert.match(lines[0], /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z start begin: instance=test$/);
    assert.match(lines[1], /probe #1: gateway 20001 not listening after 15s$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("readInstancePorts reads this instance's .env without spawning python", async () => {
  const home = await mkdtemp(join(tmpdir(), "jw-home-"));
  try {
    const cfg = jwConfig({ JIUWENSWARM_HOME: home, JIUWENSWARM_INSTANCE: "testinst" });
    await mkdir(join(home, ".jiuwenswarm-instances", "testinst"), { recursive: true });
    await writeFile(
      join(home, ".jiuwenswarm-instances", "testinst", ".env"),
      "GATEWAY_PORT=20001\nWEB_PORT=20000\nAGENT_SERVER_PORT=19092\n",
      "utf8",
    );
    assert.deepEqual(await readInstancePorts(cfg), { gateway: 20001, web: 20000, agentServer: 19092 });
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("readInstancePorts returns null when the instance has no .env yet", async () => {
  const home = await mkdtemp(join(tmpdir(), "jw-home-empty-"));
  try {
    const cfg = jwConfig({ JIUWENSWARM_HOME: home, JIUWENSWARM_INSTANCE: "fresh" });
    assert.equal(await readInstancePorts(cfg), null);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
