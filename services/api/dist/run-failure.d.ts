/**
 * Stable failure classes for an agent run.
 *
 * Callers (UI, logs, retry policy) need a code they can branch on without
 * pattern-matching provider prose. The classification is derived from the
 * error, never a replacement for it: the original message — including the
 * provider's own response text — is preserved and surfaced alongside the code,
 * so a failing run stays diagnosable.
 */
import type { RunFailureCode } from "@sciencediscovery/schema";
/** Classify a run error into a stable code. The message is never consumed. */
export declare function classifyRunFailure(error: unknown): RunFailureCode;
/** The original failure text, preserved verbatim for the user and the record. */
export declare function runFailureMessage(error: unknown): string;
