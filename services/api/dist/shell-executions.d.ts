import type { DatabaseSync } from "node:sqlite";
import { VersionStore, type AgentStateRef } from "@sciencediscovery/cas";
import type { ShellExecutionContext } from "@sciencediscovery/provenance";
import type { RunnerClient } from "@sciencediscovery/executor";
import { type RecoveryContext } from "@sciencediscovery/schema";
import { type OperationalLogger } from "@sciencediscovery/operational-logging";
import type { AgentShellExecution, ExecutionOwner, ExecutionRun, ManagedExecution, ShellExecutionResult } from "@sciencediscovery/schema";
import type { AgentNotifications } from "./agent-notifications.js";
type RecoveryAttempt = {
    context: RecoveryContext;
    requestDigest: string;
};
type Record = Omit<AgentShellExecution, "result"> & {
    resultRef?: AgentStateRef;
    historical?: boolean;
    candidateResultRef?: AgentStateRef;
    candidateFailure?: AuthoritativeFailure;
    originalExecutionContext?: ShellExecutionContext;
    expectedRunnerInstanceId?: string;
    catalogRevision?: number;
    submissionDigest?: string;
};
type AuthoritativeFailure = {
    state: "failed" | "cancelled";
    finishedAt: string;
    startedAt?: string;
    error?: string;
};
export interface ExecutionRecoveryHandlers {
    /** Must re-check current Session/Agent/Runner authorization on every call. */
    runner(execution: AgentShellExecution): RunnerClient;
    finalize(context: ShellExecutionContext, result: ShellExecutionResult, runner: RunnerClient, status: "succeeded" | "failed" | "cancelled"): Promise<ShellExecutionResult>;
    finalizeFailure?(context: ShellExecutionContext, failure: AuthoritativeFailure): Promise<void>;
}
type RecordExecution = (id: string, dispatch: RunnerClient["executeShell"], status: () => ExecutionRun["status"]) => Promise<ShellExecutionResult>;
type RunnerResolver = (runnerId: string) => RunnerClient;
/**
 * A Runner outcome adopted for an execution whose own outcome was never
 * observed. The command is not replayed: the Runner's committed record for
 * that Execution ID is read and adopted as-is.
 */
export interface AdoptedShellOutcome {
    /** The shell execution record that now carries the committed outcome. */
    execution: AgentShellExecution;
    /** The Runner's committed observation. */
    observed: ManagedExecution;
    /** The outcome the Runner settled. */
    status: "succeeded" | "failed" | "cancelled";
}
/**
 * Records the real provenance outcome of an adopted execution. It runs after
 * the shell record is durable, and its failure never invalidates that record.
 */
export type OutcomeAdopter = (adopted: AdoptedShellOutcome) => Promise<void>;
/** Tracks accepted work independently of an Agent turn. It never replays commands. */
export declare class ShellExecutions {
    private readonly db;
    private readonly versions;
    private readonly notifications;
    private readonly pollMs;
    private readonly waitForPoll;
    private readonly log;
    private readonly active;
    private readonly reconciling;
    private runnerConnection?;
    private readonly leaseOwner;
    private recovery?;
    private timer?;
    private closed;
    private scan?;
    private recoveryWake;
    private outcomeAdopter?;
    constructor(db: DatabaseSync, versions: VersionStore, notifications: AgentNotifications, pollMs?: number, waitForPoll?: (ms: number) => Promise<void>, log?: Pick<OperationalLogger, "info" | "warn">);
    /** Names the connection each Runner request went through, so a lost observation is not read as a failed job. */
    describeRunnerConnections(describe: (runnerId: string) => string): void;
    /**
     * Install the writer that records an adopted outcome in the provenance log.
     * It runs only when an execution whose outcome was never observed is
     * adopted as a committed Runner result (via settle / reconcile).
     */
    setOutcomeAdopter(adopter: OutcomeAdopter): void;
    private connection;
    private save;
    private acquire;
    private release;
    private heartbeat;
    /** Start only after the authenticated Runner resolver and finalizer are ready. */
    configureRecovery(handlers: ExecutionRecoveryHandlers): void;
    close(): void;
    /** Bounded polling also detects reconnection, without recreating an execution. */
    reconcilePending(runnerId?: string, force?: boolean): Promise<void>;
    private scanPending;
    private assertObserved;
    private observed;
    /** True while a record is retrying a commit that has already failed once. Both
     *  provenance commits are covered: an existing result pins `candidateResultRef`, a
     *  terminal failure pins `candidateFailure`, and without the second term the failure
     *  commit was reopened by every attempt and its budget could never run out. */
    private retryingPinnedCommit;
    private assertTerminalEvidence;
    private commitFailure;
    private existingResult;
    private unavailable;
    /** The Runner answered a submission with a definite 4xx: the command never ran.
     *  Settle it failed (committed) with a visible error instead of an unknown outcome. */
    private rejectSubmission;
    /** True when the Runner has definitively refused to hand over an execution it
     *  had already accepted: 401/403 mean "not yours any more", 404 means "not
     *  there". None of these become readable by waiting, so they are terminal.
     *  Only when no result was captured yet: once `existingResult` has pinned the
     *  bytes, a later refusal is a recoverable finalization failure, not an
     *  unreadable result. */
    private acceptedButUnreadable;
    /** Settle an accepted execution whose result can no longer be read. It is
     *  recorded as failed with committed provenance, and the message says what is
     *  actually known: the command was accepted and may have run, but the Runner
     *  will not return its result, so the workspace must be inspected before
     *  anything is re-run. */
    private failUnreadableResult;
    /** Observation and existing-result finalization only. This method cannot submit. */
    reconcile(id: string, owner: ExecutionOwner, handlers?: ExecutionRecoveryHandlers | undefined, runner?: RunnerResolver, signal?: AbortSignal): Promise<AgentShellExecution>;
    private record;
    snapshot(sessionId: string, agentId?: string): Record[];
    /**
     * The executions as the export revision should see them: only what a package
     * would carry, never the retry bookkeeping.
     *
     * `snapshot()` includes `observation.nextRetryAt` and `failureCount`, which a
     * rescheduled retry rewrites every few seconds while the session itself is
     * unchanged. Hashing that made the revision move forever, so a session with
     * one execution stuck in the commit-retry loop could never be exported
     * (#1018). A real change — state, provenance, finalization, the error code or
     * the committed result — still changes this projection.
     */
    revisionSnapshot(sessionId: string): Array<{
        accepted: boolean;
        error: string | undefined;
        finalization: string | undefined;
        finishedAt: string | undefined;
        id: string;
        provenance: string;
        resultRef: unknown;
        startedAt: string | undefined;
        state: string;
    }>;
    list(owner: ExecutionOwner): AgentShellExecution[];
    /** The catalog entry alone: state and timestamps without reading the result payload. */
    find(id: string, owner: ExecutionOwner): AgentShellExecution;
    get(id: string, owner: ExecutionOwner): Promise<AgentShellExecution>;
    restoreHistorical(source: AgentShellExecution): Promise<void>;
    /** Return only after the Runner acknowledges acceptance (or an explicit unknown outcome). */
    start(owner: ExecutionOwner, identity: {
        runnerId: string;
        workspaceId: string;
        turnId: string;
    }, runner: () => RunnerClient, recordExecution: RecordExecution, contextOrAttempt?: ((id: string) => ShellExecutionContext) | RecoveryAttempt, finalizeFailure?: ExecutionRecoveryHandlers["finalizeFailure"], continuation?: RecoveryAttempt): Promise<AgentShellExecution>;
    /**
     * Query the same Execution ID until the Runner reports a terminal state.
     * A retryable failure only delays the next query and any answer resets the
     * count; MAX_CONSECUTIVE_OBSERVATION_FAILURES in a row ends the observation,
     * never the command, and is never answered by submitting it again.
     */
    private follow;
    /** Adopt the Runner's terminal record under the same rules as an uninterrupted observation. */
    private settle;
    /**
     * Append the real provenance outcome for an execution that settle() just
     * committed. Failures here never undo the durable shell record.
     */
    private recordAdoptedOutcome;
    private finish;
    /**
     * A wait deadline never reaches the process controller. With a Runner
     * resolver, an unconfirmed execution is first reconciled with its Runner.
     */
    wait(id: string, owner: ExecutionOwner, waitMs: number, signal?: AbortSignal, runner?: RunnerResolver): Promise<AgentShellExecution>;
    logs(id: string, owner: ExecutionOwner, runner: (id: string) => RunnerClient, cursor?: number): Promise<import("@sciencediscovery/schema").ExecutionLogPage>;
    /**
     * Cancel one execution.
     *
     * For an unconfirmed outcome (`state="unknown"`) the Runner call is
     * best-effort: that execution may already be gone from the Runner's ledger,
     * and a cancel that waits on a Runner which will never answer is what left the
     * request line unfinished in #1012, with the project delete parked behind it
     * until the adapter's read deadline. The caller asked to end this work, so the
     * record settles as `cancelled` locally either way — otherwise the workspace
     * guard keeps refusing every new command in it and the only recovery is
     * restarting the stack.
     *
     * Only an explicit cancel settles an unknown record. The guard keeps its
     * meaning for everyone who has not asked: work that never reported may still
     * be running out there.
     */
    cancel(id: string, owner: ExecutionOwner, runner: (id: string) => RunnerClient): Promise<AgentShellExecution>;
    /** Settle a record the caller cancelled although its outcome was never confirmed.
     *
     *  An observer write can land while the Runner call above is pending — `reconcile`
     *  runs before every `execution_status` and `wait`, and each of those rewrites an
     *  `unknown` record — so `finish`'s revision CAS can come back `STALE_OBSERVER`.
     *  Cancelling is idempotent, so re-read and repeat instead of answering 500 and
     *  settling nothing: this is the one action the whole change exists to make
     *  reliable, and the race is the normal shape of the #1012 flow rather than an
     *  exotic one. */
    private settleCancelled;
}
export {};
