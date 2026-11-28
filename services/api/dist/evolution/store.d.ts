import type { EvolveEvent, EvolveEventRecord, EvolveGoal, EvolveRun, EvolveRunFailure, EvolveRunStatus } from "@sciencediscovery/schema";
export interface CreateEvolveRunInput {
    goal: EvolveGoal;
    /** Optional explicit id; generated when absent. */
    id?: string;
    projectId?: string;
    /** Set when this run continues another run's search. */
    resumedFromRunId?: string;
    /** Set when this run was created by retrying a failed run. */
    retryOfRunId?: string;
    sessionId: string;
    /** Restore path: the exported run's own timestamp. Defaults to now. */
    createdAt?: string;
}
export interface AppendEventsResult {
    /** Records written, in order. */
    applied: EvolveEventRecord[];
    /** Watermark after the append. */
    lastSeq: number;
    /** Records dropped because they were at or below the watermark. */
    skipped: number;
}
export declare class EvolutionStoreError extends Error {
}
export declare function assertValidRunId(runId: string): void;
/**
 * Parse an NDJSON event log, skipping anything unreadable.
 *
 * A crash mid-append leaves a torn last line; dropping it is right, because the
 * alternative — refusing to read the log at all — loses every event before it.
 */
export declare function parseEventLines(content: string): EvolveEventRecord[];
/** Wrap bare events in records with consecutive sequence numbers. */
export declare function makeEventRecords(events: EvolveEvent[], startSequence: number, createdAt?: string): EvolveEventRecord[];
export declare class EvolutionStore {
    readonly root: string;
    private readonly locks;
    constructor(dataDir: string);
    /** Idempotent: safe on every boot. */
    initialize(): Promise<void>;
    runDirectory(runId: string): string;
    ledgerDirectory(runId: string): string;
    resultsDirectory(runId: string): string;
    eventLogPath(runId: string): string;
    private runFilePath;
    createRun(input: CreateEvolveRunInput): Promise<EvolveRun>;
    readRun(runId: string): Promise<EvolveRun | undefined>;
    /** Newest first. `sessionId` narrows to one session's runs. */
    listRuns(sessionId?: string): Promise<EvolveRun[]>;
    /**
     * Read-modify-write of one run record under its lock.
     *
     * `lastSeq` is not patchable here — it moves only through `appendEvents`, so
     * the watermark can never disagree with the log it describes.
     */
    patchRun(runId: string, patch: Partial<Omit<EvolveRun, "createdAt" | "goal" | "id" | "lastSeq" | "sessionId">>): Promise<EvolveRun>;
    /**
     * Append events past the run's watermark and advance it.
     *
     * Records are expected in ascending sequence order; anything at or below the
     * watermark is dropped rather than rejected, so a producer that reconnects and
     * replays its buffer is a no-op instead of an error.
     */
    appendEvents(runId: string, records: EvolveEventRecord[]): Promise<AppendEventsResult>;
    /** Every event after `afterSequence` (default: from the beginning). */
    readEvents(runId: string, afterSequence?: number): Promise<EvolveEventRecord[]>;
    /** Terminal transition helper: stamps `finishedAt` exactly once.
     *
     *  `failure` is either the legacy free-text sentence or the structured
     *  reason. A structured reason is also mirrored into `error`, so an older
     *  client (or the agent summary) still sees a sentence while a newer one can
     *  show a translated category. */
    finishRun(runId: string, status: EvolveRunStatus, failure?: string | EvolveRunFailure): Promise<EvolveRun>;
    /** Removes a run's metadata, event log, ledger and results. */
    deleteRun(runId: string): Promise<void>;
    /** Write-to-temp-then-rename: a crash leaves either the old record or the new
     * one, never a half-written file.
     *
     * `run.json` is rewritten on every event — several times a second on a fast
     * search — which on Windows is exactly the pattern a virus scanner watches
     * for. A rename the scanner wins once used to fail the entire run; the
     * helper retries the transient refusals. */
    private writeRunFile;
}
