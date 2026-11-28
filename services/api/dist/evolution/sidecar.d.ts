/**
 * Client for the evolve search sidecar (`services/evolve`, explicitly configured or launcher-owned loopback).
 *
 * The sidecar streams NDJSON event records on the response to `POST /runs`, so
 * the connection *is* the run's liveness signal: while it is open the search is
 * alive, and when it closes the run is over one way or another. That is why
 * there is no polling here and no callback endpoint on the API side.
 *
 * Nothing in this module writes to disk or decides a run's fate — it turns bytes
 * into records and hands them to the orchestrator.
 */
import type { EvolveEventRecord } from "@sciencediscovery/schema";
export interface EvolveRunSpec {
    algorithm: string;
    /** What the control plane's probe found; the sidecar never probes itself. */
    sandbox?: Record<string, unknown>;
    /** The program the search starts from. Empty means the engine's own seed. */
    baselineCode?: string;
    baselineScore?: number;
    candidateTimeoutSeconds?: number;
    /** Where this run's shards were staged. The split policy is decided here and
     *  read there; deciding it twice is how two answers start to disagree. */
    datasetDir?: string;
    engine?: string;
    expansions: number;
    /** `{url, token}` for the judge model, when the scorecard is graded by one.
     *  A second token because the proxy pins the model to the token. */
    judge?: {
        token: string;
        url: string;
    };
    /** `{url, token}` — an **absolute** proxy URL. A sidecar that had to guess
     *  the API's origin would turn every expansion into a failed candidate. */
    llm?: {
        token: string;
        url: string;
    };
    /** A snapshot of the project, for a test-gated search. */
    workspaceDir?: string;
    /** The rubric a judged scorecard grades against, inline. Small, frozen with
     *  the goal, and needed on every grading call. */
    /** Packages to put into the candidate runtime before anything runs. */
    packages?: string[];
    rubric?: string;
    /** The evaluator a scripted scorecard scores with, inline. Same reason as the
     *  rubric: the sidecar has no CAS access, and an evaluator is a page of
     *  Python — smaller than one candidate. */
    script?: string;
    maxTokensPerCall?: number;
    options?: Record<string, unknown>;
    /** Continue a previous run's numbering instead of restarting at 1. */
    resumeFromSequence?: number;
    /** The frozen scorecard body. The sidecar grades with it; the hash is the
     *  identity both sides agree on. */
    scorecard?: unknown;
    scorecardHash: string;
    searchId: string;
    statement?: string;
    /** `"auto"`, `"disabled"` or `"enabled"`; auto is omitted at the provider boundary. */
    thinking?: string;
    thinkingEffort?: string;
    workers?: number;
}
export declare class EvolveSidecarError extends Error {
    readonly status?: number;
    constructor(message: string, status?: number);
}
/** A record the sidecar sent that did not parse as an event. Skipped rather
 * than fatal: one malformed line must not discard the run around it. */
export type EvolveSidecarWarning = (message: string) => void;
/** Why the control plane is asking a search to stop.
 *
 *  `cause` is the part the sidecar branches on: only `budget` permits one bounded
 *  held-out evaluation of the candidates already generated. `reason` is the
 *  sentence the run record and the sidecar's terminal event carry, so the record
 *  says `token budget reached (600000)` instead of the framework's own
 *  `max_iters`. */
export interface EvolveStopReason {
    cause: "budget" | "wall_clock" | "user" | "disconnect";
    reason?: string;
}
export interface EvolveSidecarOptions {
    internalToken: string;
    url: string;
    connection?: () => Promise<{
        url: string;
        internalToken: string;
    }>;
}
export declare class EvolveSidecarClient {
    private readonly options;
    constructor(options: EvolveSidecarOptions);
    private connection;
    /** The wire body, built once: `/runs` and `/probe` have to agree about every
     *  field, or the probe measures a different search than the one that runs. */
    private body;
    /**
     * Score the starting point and a deliberately worse copy of it.
     *
     * Two evaluations before a run exists, which is what the answer costs. It
     * cannot be derived from the goal: "can this scoring tell a good candidate
     * from a bad one" is a fact about the data and the scorer, and its failure is
     * the silent one — a flat scorecard produces a search that emits every event
     * and finds nothing.
     */
    probe(spec: EvolveRunSpec): Promise<{
        baseline: number;
        flat: boolean;
        label: string;
        worsened: number | null;
    }>;
    health(): Promise<{
        engine?: string;
        status: string;
    } | undefined>;
    /**
     * Start a search and yield every event record it emits.
     *
     * `signal` aborts the HTTP request, which closes the sidecar's generator and
     * winds the engine down — the same path a crashed API takes, so it is
     * exercised by every cancelled run rather than only by a disaster.
     */
    stream(spec: EvolveRunSpec, signal?: AbortSignal, warn?: EvolveSidecarWarning): AsyncGenerator<EvolveEventRecord>;
    /** Idempotent by contract: stopping an unknown or finished search is a
     * no-op, because the API races the stream's own completion.
     *
     * `why` travels with the request because the sidecar cannot work it out: it is
     * handed a stop flag and no budget, so a token gate and a person pressing stop
     * are the same request over there. The cause is what lets it run one bounded
     * held-out evaluation for a budget that ran out, while a user stop still
     * aborts immediately.
     *
     * The sidecar keeps the **first** cause it was given, so a second stop can be
     * answered up to one bounded evaluation late while a budget finalization is
     * already running; that evaluation is capped by the candidate timeout. */
    stop(searchId: string, why?: EvolveStopReason): Promise<boolean>;
}
/**
 * Split an NDJSON byte stream into event records.
 *
 * The buffer matters: a chunk boundary lands mid-line often enough that parsing
 * per chunk would drop roughly one event per network buffer. A trailing partial
 * line at end-of-stream is dropped — it is a torn write from a killed sidecar,
 * and the same tolerance the on-disk log reader applies.
 */
export declare function parseNdjsonStream(body: ReadableStream<Uint8Array>, warn?: EvolveSidecarWarning): AsyncGenerator<EvolveEventRecord>;
/**
 * The message inside a sidecar error response, or a plain fallback.
 *
 * FastAPI wraps a refusal as `{"detail": {"code": …, "message": …}}` and a
 * validation failure as `{"detail": [...]}`; older handlers send a bare string.
 * All three read as noise on a screen, and the sentence a user needs is one
 * level in.
 */
export declare function refusal(response: Response, prefix: string): Promise<string>;
