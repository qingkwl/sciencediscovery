// Seatbelt self-probe (B2-1, D2 §8): decides whether this macOS can run the
// sandboxed execution path at all, BEFORE the wizard lets the user into the
// main UI. Upstream red line: a failed probe must not pass go (fail-closed).
//
// Layering follows the shell's established split (F12 philosophy, proven
// across B1): the DECISION is pure (exit code + signal → verdict, with the
// reason string the error page will show), and the IO is one thin spawn
// that any test can fake. Nothing imports Electron here.
//
// The probe runs sandbox-exec with a minimal allow-default profile against
// /usr/bin/true: success proves both that the binary exists and that the
// kernel accepted a profile compile — the same machinery the payload's
// runner (services/runner seatbelt.ts) uses per task. MDM-controlled Macs
// and nested virtualization can break one or both; those users get the
// error page instead of a mid-run surprise.
import type { ChildProcessWithoutNullStreams } from "node:child_process";

/** Minimal profile: version header + allow default (no deny rules). */
export const SEATBELT_PROBE_PROFILE = "(version 1)(allow default)";

/** The target /usr/bin/true — exists on every macOS since time began. */
export const SEATBELT_PROBE_TARGET = "/usr/bin/true";

/** Spawn-contract type: everything the decision needs, faked in tests. */
export interface SeatbeltProbeOutcome {
  /** Exit code (null when killed by a signal). */
  code: number | null;
  /** Signal that killed the process, if any (e.g. "SIGKILL"). */
  signal: NodeJS.Signals | null;
  /** True when spawn itself failed (ENOENT: no sandbox-exec on PATH). */
  spawnError?: string;
}

export type SeatbeltVerdict =
  | { kind: "ok"; platform: "darwin" }
  | { kind: "failed"; platform: "darwin"; reason: string; diagnostics: string[] }
  | { kind: "not-applicable"; platform: "win32" | "linux" };

/**
 * Pure decision over a probe outcome (and the platform, so win32/linux
 * short-circuit without ever spawning). The reason strings are the
 * user-facing copy for the B2-2 error page; diagnostics are the commands
 * the page suggests the user runs.
 */
export function interpretSeatbeltProbe(
  outcome: SeatbeltProbeOutcome,
  platform: NodeJS.Platform,
): SeatbeltVerdict {
  if (platform !== "darwin") {
    // Windows has no Seatbelt and no fail-closed contract (Provider A runs
    // unsandboxed by design — SCIENCE_AGENT_EVOLVE_UNISOLATED, B1-4); Linux
    // is a dev-only host. Neither wizard ever shows this check.
    return { kind: "not-applicable", platform: platform as "win32" | "linux" };
  }
  if (outcome.spawnError) {
    return {
      kind: "failed",
      platform: "darwin",
      reason:
        "未检测到 macOS 沙箱（Seatbelt）：找不到 sandbox-exec 命令。SD 桌面版必须在沙箱内运行代码，无法继续。",
      diagnostics: [
        "ls -l /usr/bin/sandbox-exec   # 检查命令是否存在",
        "sudo profiles status -all     # 查看是否有 MDM 下发的受限配置（建议联系管理员）",
      ],
    };
  }
  if (outcome.code === 0) return { kind: "ok", platform: "darwin" };
  if (outcome.code === null && outcome.signal) {
    return {
      kind: "failed",
      platform: "darwin",
      reason: `沙箱探测进程被 ${outcome.signal} 信号终止，无法确认 Seatbelt 可用。SD 桌面版必须在沙箱内运行代码，无法继续。`,
      diagnostics: [
        "ls -l /usr/bin/sandbox-exec   # 检查命令是否存在",
        "sudo profiles status -all     # 查看是否有 MDM 下发的受限配置（建议联系管理员）",
      ],
    };
  }
  return {
    kind: "failed",
    platform: "darwin",
    reason: `沙箱探测失败（sandbox-exec 退出码 ${outcome.code}）。在 MDM 受控或嵌套虚拟化环境中 Seatbelt 可能被禁用。SD 桌面版必须在沙箱内运行代码，无法继续。`,
    diagnostics: [
      "sandbox-exec -p '(version 1)(allow default)' /usr/bin/true   # 手动复现探测",
      "sudo profiles status -all     # 查看是否有 MDM 下发的受限配置（建议联系管理员）",
    ],
  };
}

/** Minimal spawn shape the thin IO needs (tests fake this). */
export type ProbeSpawn = (command: string, args: string[])
  => Pick<ChildProcessWithoutNullStreams, "on">;

/**
 * Thin IO: run the actual sandbox-exec probe. The spawn function is
 * injectable so tests never touch a real sandbox-exec (the agent sandbox
 * itself denies sandbox-exec — exit 71 — which would fake a "failed"
 * verdict on every dev machine; B1-3 documented the same trap for
 * process-group signals).
 */
export async function runSeatbeltProbe(
  platform: NodeJS.Platform,
  spawnImpl: ProbeSpawn,
): Promise<SeatbeltVerdict> {
  // Non-darwin short-circuits BEFORE spawning (and before any outcome
  // matters): the verdict is platform-only there.
  if (platform !== "darwin") return interpretSeatbeltProbe({ code: 0, signal: null }, platform);
  return new Promise<SeatbeltVerdict>((resolve) => {
    let settled = false;
    const finish = (outcome: SeatbeltProbeOutcome) => {
      if (!settled) {
        settled = true;
        resolve(interpretSeatbeltProbe(outcome, platform));
      }
    };
    try {
      const child = spawnImpl("sandbox-exec", [
        "-p", SEATBELT_PROBE_PROFILE, SEATBELT_PROBE_TARGET,
      ]);
      child.on("error", (err: NodeJS.ErrnoException) =>
        finish({ code: null, signal: null, spawnError: err.message }));
      child.on("close", (code: number | null, signal: NodeJS.Signals | null) =>
        finish({ code, signal }));
    } catch (err) {
      // Synchronous spawn throw (bad args / no child_process module) —
      // treated as a spawn failure, never as "available".
      finish({ code: null, signal: null, spawnError: String(err) });
    }
  });
}
