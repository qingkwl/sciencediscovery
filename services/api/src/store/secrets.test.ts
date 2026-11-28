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

import { createTest } from "../../../../test/support/tagged/compat.mjs";
const { test } = createTest(import.meta.url, { tags: ["category:ut", "os:linux", "os:macos", "os:windows", "arch:amd64", "arch:arm64"] });
import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { TestContext } from "node:test";

// loadOrCreateModelSecretKey's at-rest format branches are driven with an
// injected fake protector (the real DPAPI round trip is covered by
// platform/os/win32.test.ts), keeping these tests host-platform-agnostic.
import type { SecretProtector } from "../platform/os/types.js";
import { loadOrCreateModelSecretKey, modelSecretKey, warmModelSecretKey } from "./secrets.js";

const MAGIC = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
const RAW_KEY = Buffer.alloc(32, 7);

/** A reversible stand-in with the same shape as the DPAPI protector:
 *  wrapped files are MAGIC followed by the 32 key bytes. */
function fakeProtector(wrapsAtRest: boolean): SecretProtector {
  return {
    wrapsAtRest,
    isWrapped: (bytes) => bytes.length >= MAGIC.length && bytes.subarray(0, MAGIC.length).equals(MAGIC),
    async wrap(plain) {
      return Buffer.concat([MAGIC, plain]);
    },
    async unwrap(wrapped) {
      if (!wrapped.subarray(0, MAGIC.length).equals(MAGIC) || wrapped.length !== MAGIC.length + 32) {
        throw new Error("blob is not decryptable");
      }
      return wrapped.subarray(MAGIC.length);
    },
  };
}

async function keyFileFixture(context: TestContext, name: string): Promise<string> {
  const root = resolve(process.cwd(), ".tmp", `${name}-${Date.now()}-${process.pid}`);
  await mkdir(root, { recursive: true });
  context.after(() => rm(root, { force: true, recursive: true }));
  return resolve(root, "model-secrets.key");
}

test("first start creates a wrapped key when the platform wraps at rest, and reads it back", async (context) => {
  const path = await keyFileFixture(context, "secrets-create-wrapped");
  const protector = fakeProtector(true);

  const key = await loadOrCreateModelSecretKey(path, protector);

  assert.equal(key.length, 32);
  const stored = await readFile(path);
  assert.equal(protector.isWrapped(stored), true, "at rest the key file must not hold raw bytes");
  assert.deepEqual(stored, Buffer.concat([MAGIC, key]));
  assert.deepEqual(await loadOrCreateModelSecretKey(path, protector), key, "a restart unwraps the same key");
});

test("a wrapped file is unwrapped on read without rewriting it", async (context) => {
  const path = await keyFileFixture(context, "secrets-unwrap");
  await writeFile(path, Buffer.concat([MAGIC, RAW_KEY]), { mode: 0o600 });
  const before = await readFile(path);

  const key = await loadOrCreateModelSecretKey(path, fakeProtector(true));

  assert.deepEqual(key, RAW_KEY);
  assert.deepEqual(await readFile(path), before, "reading must not touch the stored blob");
});

test("a legacy raw key is upgraded in place on a wrapping platform", async (context) => {
  const path = await keyFileFixture(context, "secrets-upgrade-legacy");
  await writeFile(path, RAW_KEY, { mode: 0o600 });

  const key = await loadOrCreateModelSecretKey(path, fakeProtector(true));

  assert.deepEqual(key, RAW_KEY, "the upgrade must keep the same key bytes");
  const upgraded = await readFile(path);
  assert.equal(fakeProtector(true).isWrapped(upgraded), true, "the file must not stay raw");
  assert.deepEqual(await loadOrCreateModelSecretKey(path, fakeProtector(true)), RAW_KEY, "the upgraded file reads back to the same key");
});

test("an undecryptable blob errors instead of silently regenerating", async (context) => {
  const path = await keyFileFixture(context, "secrets-broken-blob");
  const garbage = Buffer.concat([MAGIC, Buffer.alloc(10, 9)]);
  await writeFile(path, garbage, { mode: 0o600 });

  await assert.rejects(loadOrCreateModelSecretKey(path, fakeProtector(true)), /cannot be decrypted/);
  assert.deepEqual(await readFile(path), garbage, "a failed unwrap must leave the file untouched");
});

test("an identity protector keeps raw bytes on disk, with no migration", async (context) => {
  const path = await keyFileFixture(context, "secrets-identity");
  const protector = fakeProtector(false);

  const key = await loadOrCreateModelSecretKey(path, protector);

  assert.equal(key.length, 32);
  assert.deepEqual(await readFile(path), key, "the file stores the raw key bytes");
  assert.deepEqual(await loadOrCreateModelSecretKey(path, protector), key);
  assert.deepEqual(await readFile(path), key, "raw files stay raw on identity platforms");
});

// [W31-①] The process-wide memo: two consumers of the same key path (the
// session store and the custom-MCP-servers loader share one data dir) must
// pay the protector exactly once per process, and a rejected unwrap must not
// be cached — the next call retries (fail-fast stays observable).
test("modelSecretKey memo resolves once per path and does not cache rejections", async (context) => {
  const path = await keyFileFixture(context, "secrets-memo");
  let unwrapCalls = 0;
  const countingProtector = fakeProtector(true);
  const originalUnwrap = countingProtector.unwrap.bind(countingProtector);
  countingProtector.unwrap = async (wrapped: Buffer) => {
    unwrapCalls += 1;
    return originalUnwrap(wrapped);
  };

  await writeFile(path, Buffer.concat([MAGIC, RAW_KEY]), { mode: 0o600 });

  const [first, second] = await Promise.all([modelSecretKey(path, countingProtector), modelSecretKey(path, countingProtector)]);
  assert.deepEqual(first, RAW_KEY);
  assert.deepEqual(second, RAW_KEY);
  assert.equal(unwrapCalls, 1, "concurrent loads of the same path must unwrap once");

  // A second sequential load (the "restart in the same process" shape of
  // store.close() then store.load()) still hits the memo.
  assert.deepEqual(await modelSecretKey(path, countingProtector), RAW_KEY);
  assert.equal(unwrapCalls, 1, "the memo serves later loads from memory");

  // warmModelSecretKey must not throw and must populate the memo.
  const warmPath = await keyFileFixture(context, "secrets-memo-warm");
  warmModelSecretKey(warmPath, countingProtector);
  assert.deepEqual(await modelSecretKey(warmPath, countingProtector), await modelSecretKey(warmPath, countingProtector));
});

test("modelSecretKey memo rejection is not cached", async (context) => {
  const path = await keyFileFixture(context, "secrets-memo-reject");
  const garbage = Buffer.concat([MAGIC, Buffer.alloc(10, 9)]);
  await writeFile(path, garbage, { mode: 0o600 });

  await assert.rejects(modelSecretKey(path, fakeProtector(true)), /cannot be decrypted/);
  // The failed promise must not be memoized: fixing the underlying file (or
  // any later retry) observes the current state, not the sticky rejection.
  await writeFile(path, Buffer.concat([MAGIC, RAW_KEY]), { mode: 0o600 });
  assert.deepEqual(await modelSecretKey(path, fakeProtector(true)), RAW_KEY);
});
