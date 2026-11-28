/** What the sidecar needs to build its command line. Mirrors the Python
 *  `SandboxCapability`; the wire form is snake_case. */
export interface EvolveSandboxCapability {
    /** `direct` means the candidate runs unconfined, with the user's own access.
     *  It only ever comes from an installation that opted in (Windows or macOS),
     *  and a run still needs the user's confirmation in its goal. */
    backend: "bwrap" | "seatbelt" | "direct" | null;
    bwrapPath: string;
    disableUserns: boolean;
    procMode: "bind" | "proc";
    /** Why there is no backend, for the message the user sees. */
    reason?: string;
}
export declare const SANDBOX_MISSING_HINT: string;
/**
 * The platforms whose answer needs no probing.
 *
 * Split out from the probe so the Windows decision — opt in, or refuse — can be
 * exercised on a machine that is not Windows. Linux answers `undefined` and is
 * probed for a bwrap that can actually start a namespace. macOS answers Seatbelt
 * without probing; an installation that opted into direct execution answers
 * `direct` on the same per-run-confirmation contract as Windows.
 */
export declare function sandboxForPlatform(platformName: NodeJS.Platform, options?: {
    bwrapPath?: string;
    unisolated?: boolean;
}): EvolveSandboxCapability | undefined;
/**
 * Probe once and describe what the sidecar should use.
 *
 * On macOS the answer is Seatbelt without probing: `sandbox-exec` ships with
 * the system, and there is nothing container-specific to discover — unless the
 * installation opted into direct execution, which answers `direct` on the
 * same contract as Windows.
 *
 * On Windows there is nothing to probe either way. `unisolated` is the
 * installation's own opt-in (the desktop sets it); without it the backend stays
 * null and every run that executes a candidate is refused at creation.
 */
export declare function probeEvolveSandbox(configured: string, options?: {
    unisolated?: boolean;
}): Promise<EvolveSandboxCapability>;
/** The wire form the sidecar's `RunSpec` expects. */
export declare function toSidecarCapability(capability: EvolveSandboxCapability): Record<string, unknown>;
