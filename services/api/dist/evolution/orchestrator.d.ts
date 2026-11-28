import { type VersionStore } from "@sciencediscovery/cas";
import type { EvolveEventRecord, EvolveGoal, EvolveRun } from "@sciencediscovery/schema";
import { RunnerGrantRegistry } from "./runner-proxy.js";
import type { MemoryGraphSink } from "@sciencediscovery/memory";
import { type DatasetSource } from "./dataset.js";
import type { RunTokenRegistry } from "./llm-proxy.js";
import { type EvolveSandboxCapability } from "./sandbox.js";
import { type EvolveSidecarClient, type EvolveStopReason } from "./sidecar.js";
import type { EvolutionStore } from "./store.js";
export type EvolveRunSubscriber = (record: EvolveEventRecord) => void;
/**
 * Told that a run is over, without an event to say so.
 *
 * A run can settle before the sidecar ever answers — staging failed, the
 * sidecar refused, the process could not reach it — and then no
 * `search_finished` exists to close a stream on. The control plane cannot
 * invent one: sequence numbers belong to the producer, and a locally minted
 * `lastSeq + 1` is dropped by the watermark as a replay.
 *
 * So this is a second channel that carries no sequence, is never persisted and
 * never reaches `events.ndjson`. A subscriber learns the run is over; the log
 * still holds exactly what the sidecar produced.
 */
export type EvolveRunSettled = (status: EvolveRun["status"]) => void;
export type RetryEvolveRunResult = {
    refusedBecause: string;
} | {
    run: EvolveRun;
};
export interface EvolveOrchestratorOptions {
    /** Absolute origin the sidecar reaches this process at, for the model proxy.
     *  Sent rather than guessed: the sidecar cannot know how this server was
     *  bound, and a wrong guess turns every expansion into a failed candidate. */
    apiOrigin?: string;
    /** Where datasets and baselines are read from. Without it a run cannot be
     *  staged, which is what a test that only exercises the stub wants. */
    cas?: DatasetSource;
    /** Where a session's project files live. Only a test-gated search needs it,
     *  and only to take one snapshot per run. */
    workspacePath?: (sessionId: string) => string;
    /** Required for Workspace exports; live-file copying is not a fallback. */
    workspaceVersions?: VersionStore;
    /** Pin an engine for every run, overriding the goal. For reproductions. */
    engine?: string;
    /**
     * Save a finished run's result: the seed and the winner, as two versions of
     * one artifact.
     *
     * A candidate is not an artifact — most are refused, and copying every one
     * into content-addressed storage would fill it with programs nobody keeps
     * (see `handleGetCandidate`). The **winner** is the exception, because it is
     * the thing the run exists to produce, and without this it never leaves the
     * evolve subsystem: watched an agent finish a search at 0.83, find the
     * workspace still holding the seed, and set out to reconstruct the winner
     * from its one-line change summary — which yields a different program that
     * has never been scored.
     *
     * Given the winner's hash rather than its source: the orchestrator is the
     * only side that knows which node won, and the candidate store is the only
     * side that can read it.
     */
    publishResult?: (input: {
        run: EvolveRun;
        winnerCodeHash: string;
    }) => Promise<void>;
}
export interface StartEvolveRunInput {
    goal: EvolveGoal;
    projectId?: string;
    resumedFromRunId?: string;
    /** Set when this run was created by retrying a failed run. */
    retryOfRunId?: string;
    sessionId: string;
}
export declare class EvolveOrchestrator {
    private readonly store;
    private readonly sidecar;
    /** Optional: the graph is a projection, so a run works identically with the
     *  feature switched off and no sink handed in. */
    private readonly graph;
    private readonly probeSandbox;
    /** Optional: without it a run gets no model access, which is what the stub
     *  engine needs and what a test wants by default. */
    private readonly runTokens;
    readonly runnerGrants: RunnerGrantRegistry;
    private readonly options;
    private readonly subscribers;
    private readonly settleListeners;
    private readonly inFlight;
    /** Sessions with a retry between its permission check and the new run being
     *  created. The guard exists because the check is asynchronous; without it
     *  two concurrent retries both see "no live search" and both spend. */
    private readonly retriesInFlight;
    constructor(store: EvolutionStore, sidecar: EvolveSidecarClient, graph?: MemoryGraphSink | null, probeSandbox?: () => Promise<EvolveSandboxCapability>, runTokens?: RunTokenRegistry | null, options?: EvolveOrchestratorOptions);
    /** What the sidecar calls instead of the runner. The runner token never leaves this process. */
    private npuSidecarOptions;
    /**
     * Take the discrimination probe for a goal that has not been started.
     *
     * Stages exactly what a run would stage and asks the sidecar to score two
     * candidates, so the number the probe produces is the number the search will
     * see. Measuring something else would make the check meaningless.
     */
    probe(goal: EvolveGoal, sessionId: string): Promise<{
        baseline: number;
        flat: boolean;
        label: string;
        worsened: number | null;
    }>;
    /**
     * Materialise this run's dataset and baseline program.
     *
     * Nothing is staged when the goal has no dataset-backed criterion (a
     * stub-engine placeholder), so a run that measures nothing still starts.
     * A staging failure is raised: `drive` turns it into a failed run with the
     * message on the record, which is the only place a user will look.
     */
    private stage;
    /** Export the latest committed project tree, even while a writer is active. */
    private snapshotWorkspace;
    /** The program or draft the search starts from. Missing is a warning, not a
     *  fault: a measured search falls back to the engine's own seed, and saying
     *  so beats a run that silently evolved something the user did not name. */
    private readBaseline;
    /** The rubric a judged scorecard grades against, from the store.
     *
     *  Read here rather than sent by reference: the sidecar has no CAS access,
     *  and a rubric is a page of text — smaller than one candidate. */
    private readRubric;
    /** Probed once per process: the answer cannot change without a restart, and
     *  the probe launches a real bubblewrap. */
    private sandboxPromise?;
    sandboxCapability(): Promise<EvolveSandboxCapability>;
    /**
     * Mark runs left non-terminal by a previous process as failed.
     *
     * The sidecar's stream died with the old connection, so nothing is going to
     * finish them. Doing this at boot rather than lazily means the workspace card
     * never shows a run that has been "running" since last Tuesday.
     */
    adoptOrphanedRuns(): Promise<number>;
    subscribe(runId: string, subscriber: EvolveRunSubscriber, onSettled?: EvolveRunSettled): () => void;
    isRunning(runId: string): boolean;
    /**
     * Create the run, then drive it in the background.
     *
     * Returns as soon as the record exists so the caller can answer the HTTP
     * request; the browser follows the event stream from there. A failure to even
     * reach the sidecar therefore surfaces as a failed run with a readable error
     * rather than as a 500 on the create call — the run is already a thing the
     * user can see, and hiding its failure inside a status code would lose it.
     */
    start(input: StartEvolveRunInput): Promise<EvolveRun>;
    /**
     * Start a fresh run from a failed run's persisted goal.
     *
     * This deliberately does not repeat the design turn or the discrimination
     * probe: both were paid for by the original run, and the goal already froze
     * the scorecard, baseline CAS, budget and model. The one precondition that
     * can have changed under it is whether the machine still provides the
     * isolation the goal relied on, so that is re-checked here. Nothing about
     * the permission decision is delegated to the model.
     */
    retry(attempt: Pick<EvolveRun, "id" | "sessionId">): Promise<RetryEvolveRunResult>;
    /** Ask the sidecar to stop; the terminal event still comes over the stream.
     *
     *  `why` defaults to a user stop, which is what every caller that is a person
     *  (or the agent acting for one) means. The budget gates pass their own cause
     *  and the sentence they already record: the sidecar needs both, because a
     *  token budget that ran out is allowed one bounded held-out evaluation of the
     *  candidate it already paid for, and a user stop is not. */
    stop(runId: string, why?: EvolveStopReason): Promise<boolean>;
    private drive;
    /**
     * Trip the run when it has been going for longer than the budget allows.
     *
     * A timer rather than a check per event: a search that hangs emits nothing,
     * and the gate that matters most is exactly the one for a run that stopped
     * producing evidence it is alive.
     */
    private armWallClock;
    /** Ask the search to wind down and remember why, so the terminal status can
     *  say "budget" rather than "stopped".
     *
     *  `cause` is sent with the stop request because the sidecar branches on it: a
     *  token or cost budget that ran out may still run one bounded held-out
     *  evaluation, a wall-clock limit may not. */
    private tripBudget;
    /** Check the spend gates after a cost event. */
    private checkSpendBudget;
    /** Fold one event into the run's aggregates. Returns whether it was terminal. */
    private applyEvent;
    private finish;
    /**
     * Hand the winner to whatever saves results, after the run is terminal.
     *
     * Runs last and swallows its own failures: a run that searched, scored and
     * settled did happen, and reporting it as failed because the artifact store
     * was busy would lose the far more valuable fact.
     */
    private publishWinner;
    /**
     * Tell subscribers the run is over, after the last record has been published.
     *
     * Not folded into `finish`: on the ordinary path `finish` runs *before* the
     * terminal record is published (a client that sees it and immediately reads
     * the run must not find it still "running"), so notifying there would close
     * the socket one event early. Here, in `drive`'s `finally`, everything that
     * was going to be published has been.
     */
    private notifySettled;
    private publish;
}
/**
 * The graph task id this search is mirrored under (a `:ToolCall` node since
 * upstream's Task/ToolCall split; the `subtask:` prefix is the business key).
 *
 * The `subtask:` prefix is not decoration: the sidecar's temporal-chain rebuild
 * selects auto-mirrored task nodes by exactly that prefix, and an id without it
 * would leave the search out of the session's task chain — which is what
 * `trace_provenance` walks when it asks whether the winning artifact can be
 * traced back to the research goal.
 *
 * The algorithm is deliberately not encoded here: it lives on the SearchRun, and
 * putting it in the id would make "resume with a different algorithm" look like
 * a legal state.
 */
export declare function searchSubTaskId(runId: string): string;
