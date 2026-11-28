/**
 * `/api/evolve/*` request handlers.
 *
 * Kept beside the orchestrator rather than inline in `http/index.ts`: the route
 * table there is already 2k lines, and these five handlers share a validator and
 * an SSE writer that have no other callers.
 *
 * The event route mirrors the session-run one: `Accept: text/event-stream` gets
 * a live stream that replays from disk first, anything else gets the JSON list.
 * One shape, two consumers — the dashboard follows live, a reload catches up.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { type SessionStore } from "../store.js";
import type { EvolveOrchestrator } from "./orchestrator.js";
import { type EvolutionStore } from "./store.js";
export declare function handleListRuns(response: ServerResponse, store: EvolutionStore, sessionId: string | null): Promise<void>;
/**
 * One candidate's source, by the hash the event stream carries.
 *
 * Read off the disk the sidecar wrote it to rather than out of the CAS: a
 * candidate is not an artifact yet. Most of them are refused, and copying every
 * one into content-addressed storage would fill it with programs nobody keeps —
 * the copy happens when a user saves one, which is a decision, not a side
 * effect of having tried it.
 */
export declare function handleGetCandidate(response: ServerResponse, store: EvolutionStore, candidates: {
    read: (runId: string, hash: string) => Promise<string | undefined>;
}, runId: string, hash: string): Promise<void>;
export declare function handleStopRun(response: ServerResponse, store: EvolutionStore, orchestrator: EvolveOrchestrator, runId: string): Promise<void>;
/**
 * Re-create a failed search from the goal its record already holds.
 *
 * The desktop has no create-run route — runs normally come from the agent's
 * `create_evolve_run` tool after a design turn — so retry has to be its own
 * narrow route. It only ever starts a run from an existing failed record, so
 * the frozen scorecard, baseline and budget cannot be replaced by the client
 * and no new design turn is paid for. The orchestrator decides whether the
 * goal is still runnable (failed status, one live search per session, current
 * isolation) and returns a refusal the caller can show. */
export declare function handleRetryRun(response: ServerResponse, store: EvolutionStore, orchestrator: EvolveOrchestrator, runId: string, sessions?: Pick<SessionStore, "assertSessionWritable">): Promise<void>;
/**
 * Events, either as a list or as a live SSE stream.
 *
 * The stream replays from the log first and only then attaches to the live
 * feed, with records buffered in between — attaching after the replay would
 * drop anything that arrived while the file was being read, which on a fast
 * search is most of the interesting part.
 */
export declare function handleRunEvents(request: IncomingMessage, response: ServerResponse, store: EvolutionStore, orchestrator: EvolveOrchestrator, runId: string, after: number): Promise<void>;
