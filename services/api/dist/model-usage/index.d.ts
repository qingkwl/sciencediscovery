import type { ModelInvocationKind, ModelInvocationOutcome, ModelInvocationUsage, ModelUsageStatus, PromptManifest } from "@sciencediscovery/schema";
import { SessionStore } from "../store.js";
export interface CapturedModelUsage {
    cacheReadTokens: number | null;
    cacheWriteTokens: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    reasoningTokens: number | null;
    totalTokens: number | null;
    usageStatus: ModelUsageStatus;
}
export declare function unreportedModelUsage(): CapturedModelUsage;
/**
 * Add one turn's figures to a run's running total.
 *
 * The ledger used to keep only the last turn's usage (#1109), so a row's token
 * fields described one turn while its `startedAt`/`finishedAt` described the
 * whole run. Unknown stays unknown: a turn that reported nothing leaves the
 * total as it was rather than contributing zeros, and a total that received no
 * reported turn at all stays `provider-not-reported` with null fields.
 */
export declare function addCapturedModelUsage(previous: CapturedModelUsage, next: CapturedModelUsage): CapturedModelUsage;
export declare function capturedModelUsage(event: {
    usage?: {
        cacheReadTokens?: number | null;
        cacheWriteTokens?: number | null;
        inputTokens: number;
        outputTokens: number;
        reasoningTokens?: number | null;
        totalTokens: number;
    };
    usageReported: boolean;
}): CapturedModelUsage;
export declare function appendModelUsageForManifest(store: SessionStore, options: {
    attemptIndex?: number;
    invocationId: string;
    invocationKind: ModelInvocationKind;
    manifest: PromptManifest;
    outcome?: ModelInvocationOutcome;
    runId?: string;
    /** Model turns whose figures this record sums; absent when the caller has no count. */
    turnsRecorded?: number;
    usage: CapturedModelUsage;
}): Promise<ModelInvocationUsage>;
/**
 * One delegated child's spend, as its own row.
 *
 * The parent's `task` row covers the parent's turns; a child's model turns are
 * spend of the same run but a different invocation, so they get
 * `delegation-track` — the kind declared for this in
 * `packages/schema/src/model-usage.ts` and, until now, written by nobody. The
 * child's own window is used so the row's `startedAt`/`finishedAt` describe the
 * same scope as its token figures (#1109).
 */
export declare function appendDelegatedModelUsage(store: SessionStore, options: {
    finishedAt: string;
    invocationId: string;
    model: string;
    modelProfileId: string;
    modelProfileName: string;
    parentRunId: string;
    sessionId: string;
    startedAt: string;
    turnsRecorded?: number;
    usage: CapturedModelUsage;
}): Promise<ModelInvocationUsage>;
