import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DIRECT_EXECUTION_FILE,
  parseDirectExecutionFlag,
  readDirectExecution,
  renderDirectExecutionFlag,
  writeDirectExecution,
} from "../src/direct-execution.ts";

// --- pure parse/render ---------------------------------------------------------

test("parse: only an exact \"1\" is opted-in; anything else reads OFF", () => {
  assert.equal(parseDirectExecutionFlag("1"), true);
  // Every malformed, truncated or hand-edited shape must read as OFF — the
  // sandboxed default never depends on the file being readable.
  for (const raw of ["", " ", "true", "yes", "0", "1 ", " 1", "on", "11", "1\nextra"]) {
    assert.equal(parseDirectExecutionFlag(raw), false, `expected OFF for ${JSON.stringify(raw)}`);
  }
  assert.equal(parseDirectExecutionFlag(null), false);
});

test("render round-trips with parse", () => {
  assert.equal(parseDirectExecutionFlag(renderDirectExecutionFlag(true)), true);
  assert.equal(parseDirectExecutionFlag(renderDirectExecutionFlag(false)), false);
});

// --- file IO (the shell-locale precedent: one tiny file, best-effort) ----------

test("read: missing file = OFF (fail-closed default)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "direct-exec-"));
  assert.equal(readDirectExecution(dir), false);
});

test("write then read round-trips; the reply is the re-read truth", async () => {
  const dir = await mkdtemp(join(tmpdir(), "direct-exec-"));
  assert.equal(writeDirectExecution(dir, true), true, "the reply must be the persisted state");
  assert.equal(readDirectExecution(dir), true);
  const raw = await readFile(join(dir, DIRECT_EXECUTION_FILE), "utf8");
  assert.equal(raw, "1");
  assert.equal(writeDirectExecution(dir, false), false);
  assert.equal(readDirectExecution(dir), false);
});

test("a corrupted file still reads OFF, and a fresh write repairs it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "direct-exec-"));
  await writeFile(join(dir, DIRECT_EXECUTION_FILE), "true-ish garbage", "utf8");
  assert.equal(readDirectExecution(dir), false, "corruption must never read as opted-in");
  assert.equal(writeDirectExecution(dir, true), true);
  assert.equal(readDirectExecution(dir), true);
});
