import type { ArtifactReviewRun, ReviewerAuditTask, ReviewerSkipReason } from "@sciencediscovery/schema";
import { SessionStore } from "../store.js";
export type ReviewerAuditExecutionResult = ArtifactReviewRun[] | {
    skipped: true;
    skipReason?: ReviewerSkipReason;
};
export interface ReviewerAuditExecution {
    run(task: ReviewerAuditTask, signal: AbortSignal): Promise<ReviewerAuditExecutionResult>;
}
export interface ReviewerAuditScheduling {
    deepAutomaticCooldownMs?: number;
    deepBatchQuietMs?: number;
    /** Automatic audits are background work and must yield to a live lead Agent. */
    isMainAgentBusy?: (sessionId: string) => boolean | Promise<boolean>;
    mainAgentBusyRetryMs?: number;
    quickBatchQuietMs?: number;
}
/**
 * Durable, per-session Reviewer task scheduler. The scheduler deliberately
 * owns no HTTP response: artifact registration and manual clicks persist a
 * task, return immediately, and this worker does the expensive work later.
 */
export declare class ReviewerAuditCoordinator {
    private readonly store;
    private readonly execution;
    private readonly scheduling;
    private readonly active;
    /** One automatic audit for the whole API process; manual review is not throttled here. */
    private automaticTaskId;
    private readonly draining;
    /** A task admitted while drain is exiting must wake the next drain, not be dropped. */
    private readonly pendingWakeAt;
    private readonly timers;
    constructor(store: SessionStore, execution: ReviewerAuditExecution, scheduling?: ReviewerAuditScheduling);
    enqueueManual(sessionId: string, messageId: string): Promise<ReviewerAuditTask>;
    enqueueArtifactVersion(input: {
        artifactVersionId: string;
        contentHash: string;
        mediaType: string;
        sessionId: string;
    }): Promise<ReviewerAuditTask | undefined>;
    resume(): Promise<void>;
    cancelSession(sessionId: string): Promise<boolean>;
    private latestReportArtifactVersionIds;
    private createTask;
    private automaticFingerprint;
    private automaticNotBefore;
    private mergeLatestArtifactVersions;
    private publishCheckpoint;
    private settleSkippedCheckpoint;
    private skipTask;
    private scheduleAt;
    private drain;
    private isCurrentVersion;
    /** Same exact lineage used by the run Artifact UI; unknown/cyclic ancestry is never guessed from time. */
    private artifactSourceRun;
    private automaticTaskSettings;
    private feedbackFor;
}
