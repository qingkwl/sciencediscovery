import { type SandboxNetworkAccess, type SandboxNetworkSettings } from "@sciencediscovery/schema";
export declare function normalizeSandboxNetworkSettings(value: unknown): SandboxNetworkSettings;
/** Fill missing fields from the fallback (catalog migration / partial PUT). */
export declare function resolveSandboxNetworkSettings(value: unknown, fallback: SandboxNetworkSettings): SandboxNetworkSettings;
/**
 * Content-derived policy identity. Two Permission Epochs carrying the same
 * revision granted the same network access, which is what lets the runner
 * reuse one egress gateway across Sessions and what makes a policy change
 * observable as an epoch change.
 */
export declare function sandboxNetworkRevision(settings: SandboxNetworkSettings): string;
/** The immutable snapshot stored on a Permission Epoch. */
export declare function sandboxNetworkAccess(settings: SandboxNetworkSettings): SandboxNetworkAccess;
