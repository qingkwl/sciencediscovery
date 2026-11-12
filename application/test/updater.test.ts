// Tests for src/updater.ts (B4-3, D4 §5 — F11 conservative policy).
// All pure-decision coverage; the electron-updater wiring (setupAutoUpdate)
// is exercised through a fake AutoUpdaterLike at the flow level.

import test from "node:test";
import assert from "node:assert/strict";
import {
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_FIRST_CHECK_DELAY_MS,
  drainGateMessage,
  drainGateVerdict,
  nextCheckDelayMs,
  shouldPromptForUpdate,
  stackStateFrom,
  updateEnabled,
  updatePolicy,
  setupAutoUpdate,
  type AutoUpdaterLike,
} from "../src/updater.ts";

// --- policy constants ---------------------------------------------------------

test("policy: 6h interval, 30s first delay, 1h prompt ttl", () => {
  assert.equal(UPDATE_CHECK_INTERVAL_MS, 6 * 60 * 60 * 1000);
  assert.equal(UPDATE_FIRST_CHECK_DELAY_MS, 30_000);
  const p = updatePolicy();
  assert.equal(p.intervalMs, UPDATE_CHECK_INTERVAL_MS);
  assert.equal(p.firstDelayMs, UPDATE_FIRST_CHECK_DELAY_MS);
  assert.equal(p.promptTtlMs, 60 * 60 * 1000);
});

// --- shouldPromptForUpdate ----------------------------------------------------

test("prompt: null/undefined version never prompts", () => {
  assert.equal(shouldPromptForUpdate("0.3.0", null), false);
  assert.equal(shouldPromptForUpdate("0.3.0", undefined), false);
});

test("prompt: same version does not prompt (feed glitch guard)", () => {
  assert.equal(shouldPromptForUpdate("0.3.0", "0.3.0"), false);
});

test("prompt: newer version prompts", () => {
  assert.equal(shouldPromptForUpdate("0.3.0", "0.3.1"), true);
});

// --- drain gate ---------------------------------------------------------------

test("drain gate: no stack passes", () => {
  assert.deepEqual(drainGateVerdict("none"), { ok: true });
});

test("drain gate: running stack blocks (F19 inheritance)", () => {
  const v = drainGateVerdict("running");
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.reason, "stack-running");
  const msg = drainGateMessage(v);
  assert.ok(msg && msg.length > 0);
});

test("drain gate: stopping stack blocks with its own message", () => {
  const v = drainGateVerdict("stopping");
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.reason, "stack-stopping");
  assert.ok(drainGateMessage(v) !== null);
});

test("drain gate: ok verdict has no message", () => {
  assert.equal(drainGateMessage(drainGateVerdict("none")), null);
});

// --- stackStateFrom -----------------------------------------------------------

test("stackStateFrom: facts map to none/running/stopping", () => {
  assert.equal(stackStateFrom(false, false), "none");
  assert.equal(stackStateFrom(true, false), "running");
  assert.equal(stackStateFrom(true, true), "stopping");
  // stopInFlight without a handle is a main.ts impossibility; adapter
  // normalizes it to "none" (handle gone = drained).
  assert.equal(stackStateFrom(false, true), "none");
});

// --- nextCheckDelayMs ---------------------------------------------------------

test("nextCheckDelay: first check waits out the cold-start delay, then flat interval", () => {
  const p = updatePolicy();
  assert.equal(nextCheckDelayMs(false, p), p.firstDelayMs);
  assert.equal(nextCheckDelayMs(true, p), p.intervalMs);
  // late-firing checks must not cascade lateness
  assert.equal(nextCheckDelayMs(true, p), p.intervalMs);
});

// --- updateEnabled --------------------------------------------------------------

test("updateEnabled: packaged only — dev never hits the feed", () => {
  assert.equal(updateEnabled(false), false);
  assert.equal(updateEnabled(true), true);
});

// --- setupAutoUpdate flow (fake updater, injected timers) ----------------------

interface ScheduledFn { fn: () => void; delay: number }

function makeFakeUpdater(): AutoUpdaterLike & {
  events: Map<string, ((...a: unknown[]) => void)[]>;
  checks: number;
  downloads: number;
  installs: { silent?: boolean; forceRunAfter?: boolean }[];
  lastDownload: unknown;
  autoDownloadValue: boolean;
  autoInstallValue: boolean;
  setChecks(n: number): void;
  setDownloads(n: number): void;
} {
  const events = new Map<string, ((...a: unknown[]) => void)[]>();
  const state = {
    checks: 0,
    downloads: 0,
    installs: [] as { silent?: boolean; forceRunAfter?: boolean }[],
    lastDownload: undefined as unknown,
  };
  const updater = {
    autoDownload: true, // deliberately true: setup must force it false
    autoInstallOnAppQuit: true,
    on(event: string, listener: (...a: unknown[]) => void) {
      const list = events.get(event) ?? [];
      list.push(listener);
      events.set(event, list);
      return updater;
    },
    async checkForUpdates() { state.checks++; return null; },
    async downloadUpdate() { state.downloads++; return state.lastDownload; },
    quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean) {
      state.installs.push({ silent: isSilent, forceRunAfter: isForceRunAfter });
    },
    events,
    // live views over the mutable state (spread would snapshot at 0)
    get checks() { return state.checks; },
    get downloads() { return state.downloads; },
    get installs() { return state.installs; },
    setChecks(n: number) { state.checks = n; },
    setDownloads(n: number) { state.downloads = n; },
  } as unknown as ReturnType<typeof makeFakeUpdater>;
  return updater;
}

function makeSetupHarness(opts?: {
  promptAnswer?: boolean;
  stackFacts?: () => { hasHandle: boolean; stopInFlight: boolean };
}) {
  const updater = makeFakeUpdater();
  const timers: ScheduledFn[] = [];
  const logs: string[] = [];
  const notifications: { kind: string; detail: string }[] = [];
  const app = {
    getVersion: () => "0.3.0",
    on: (_e: string, _l: () => void) => {},
  } as unknown as Parameters<typeof setupAutoUpdate>[0]["app"];
  let stopCalls = 0;
  const harness = {
    updater,
    timers,
    notifications,
    logs,
    get stopCalls() { return stopCalls; },
    fire(event: string, ...args: unknown[]) {
      for (const l of updater.events.get(event) ?? []) l(...args);
    },
    runTimers() { for (const t of timers.splice(0)) t.fn(); },
  };
  setupAutoUpdate({
    app,
    autoUpdater: updater,
    log: line => logs.push(line),
    prompt: async () => opts?.promptAnswer ?? true,
    notify: (kind, detail) => notifications.push({ kind, detail }),
    stackFacts: opts?.stackFacts ?? (() => ({ hasHandle: false, stopInFlight: false })),
    stopStack: async () => { stopCalls++; },
    setTimeout: ((fn: () => void, delay: number) => {
      timers.push({ fn, delay });
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout,
  });
  return harness;
}

test("flow: knobs forced off, first check scheduled after cold-start delay", () => {
  const h = makeSetupHarness();
  assert.equal(h.updater.autoDownload, false, "autoDownload must be forced off (F11)");
  assert.equal(h.updater.autoInstallOnAppQuit, false, "autoInstallOnAppQuit must be forced off");
  assert.equal(h.updater.checks, 0, "no immediate check at startup");
  assert.equal(h.timers.length, 1);
  assert.equal(h.timers[0].delay, UPDATE_FIRST_CHECK_DELAY_MS);
});

test("flow: timer fires checkForUpdates, then reschedules on the interval", () => {
  const h = makeSetupHarness();
  h.runTimers();
  assert.equal(h.updater.checks, 1);
  assert.equal(h.timers.length, 1);
  assert.equal(h.timers[0].delay, UPDATE_CHECK_INTERVAL_MS);
});

test("flow: declined prompt downloads nothing, re-offers on next check", async () => {
  const h = makeSetupHarness({ promptAnswer: false });
  h.fire("update-available", { version: "0.3.1" });
  await new Promise(r => setImmediate(r)); // let the prompt promise resolve
  assert.equal(h.updater.downloads, 0, "declined → no download");
  h.fire("update-available", { version: "0.3.1" }); // re-offer next interval
  await new Promise(r => setImmediate(r));
  assert.equal(h.updater.downloads, 0);
});

test("flow: confirmed prompt downloads, drain gate passes, installs non-silent", async () => {
  const h = makeSetupHarness();
  h.fire("update-available", { version: "0.3.1" });
  await new Promise(r => setImmediate(r)); // let the prompt promise resolve
  assert.equal(h.updater.downloads, 1, "confirmed → exactly one download");
  assert.ok(h.notifications.some(n => n.kind === "downloading"));
  h.fire("download-complete");
  await new Promise(r => setImmediate(r)); // let the stopStack .then chain run
  assert.equal(h.stopCalls, 1, "stack stopped through the drain gate");
  assert.equal(h.updater.installs.length, 1);
  assert.equal(h.updater.installs[0].silent, false, "never a silent install");
  assert.equal(h.updater.installs[0].forceRunAfter, true);
});

test("flow: running stack blocks install at the drain gate", async () => {
  const h = makeSetupHarness({
    stackFacts: () => ({ hasHandle: true, stopInFlight: false }),
  });
  h.fire("update-available", { version: "0.3.1" });
  await new Promise(r => setImmediate(r));
  h.fire("download-complete");
  assert.equal(h.updater.installs.length, 0, "install must NOT run over a live stack");
  assert.equal(h.stopCalls, 0);
  assert.ok(h.notifications.some(n => n.kind === "drain-blocked"));
});

test("flow: same-version feed glitch never prompts", async () => {
  const h = makeSetupHarness();
  h.fire("update-available", { version: "0.3.0" });
  await new Promise(r => setImmediate(r));
  assert.equal(h.updater.downloads, 0);
});

test("flow: check errors are logged, never thrown, schedule continues", async () => {
  const h = makeSetupHarness();
  // make checkForUpdates reject
  (h.updater as unknown as { checkForUpdates: () => Promise<unknown> }).checkForUpdates =
    async () => { throw new Error("offline"); };
  h.runTimers();
  await new Promise(r => setImmediate(r)); // let the rejection reach the .catch
  assert.ok(h.logs.some(l => l.includes("update check failed")));
  assert.equal(h.timers.length, 1, "next check still scheduled");
});
