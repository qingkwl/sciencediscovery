import type { IncomingMessage, ServerResponse } from "node:http";
import { type ModelInvocationUsage, type ModelThinkingEffort, type ModelThinkingMode } from "@sciencediscovery/schema";
import type { SessionStore } from "../store.js";
/** What a run token is allowed to do, and for whom. */
interface RunGrant {
    modelId: string;
    runId: string;
    sessionId: string;
    token: string;
    controller: AbortController;
    thinking?: {
        thinkingMode?: ModelThinkingMode;
        thinkingEffort?: ModelThinkingEffort;
    };
}
/**
 * Run-scoped tokens, in memory only.
 *
 * Not persisted on purpose: a token that outlives the process would outlive the
 * run it belongs to, and the whole point is that it does not. A control-plane
 * restart therefore invalidates every outstanding token, which is the same
 * thing that happens to the runs themselves.
 */
export declare class RunTokenRegistry {
    /**
     * Grants per run, not one grant per run.
     *
     * A search can need two models: the one that rewrites the candidate and, for
     * a judged scorecard, the one that grades it. They must stay separate — the
     * proxy pins the model to the token precisely so a caller cannot pick what it
     * is billed for — so each gets its own token, and both die with the run.
     */
    private readonly grants;
    issue(runId: string, sessionId: string, modelId: string, thinking?: RunGrant["thinking"]): string;
    revoke(runId: string): void;
    /** Constant-time compare: the token is a bearer secret, and a timing oracle
     *  on it is a real (if slow) way to guess one. Every grant for the run is
     *  compared, so which model a token buys is decided by the token, not by
     *  anything the caller says. */
    resolve(runId: string, presented: string | undefined): RunGrant | undefined;
    /** Runs with at least one live token. */
    get size(): number;
}
export interface EvolveCompletionDeps {
    fetchImpl?: typeof fetch;
    onUsage?: (usage: ModelInvocationUsage) => void;
    store: SessionStore;
    tokens: RunTokenRegistry;
}
export declare function handleEvolveCompletion(request: IncomingMessage, response: ServerResponse, runId: string, deps: EvolveCompletionDeps): Promise<void>;
export {};
