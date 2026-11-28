import type { SessionStore } from "../store.js";
import type { RunTokenRegistry } from "../evolution/llm-proxy.js";
/** Only transport and credentials live here. Python owns research state and scheduling. */
export declare function createIdeaResearchClient(options: {
    url: string;
    token?: string;
    connection?: () => Promise<{
        url: string;
        internalToken: string;
    }>;
    apiOrigin: string;
    store: SessionStore;
    tokens: RunTokenRegistry;
}): {
    command: (sessionId: string, operation: string, input?: Record<string, unknown>) => Promise<any>;
    cleanup: (projectId: string, sessionId: string) => Promise<void>;
    events: (sessionId: string, researchId: string, signal: AbortSignal) => Promise<import("node:stream/web").ReadableStream<Uint8Array<ArrayBufferLike>>>;
    summary: (sessionId: string, researchId?: string) => Promise<{
        message: string;
    } | {
        activities?: import("@sciencediscovery/schema").IdeaResearchActivity[];
        id: string;
        status: "running" | "pausing" | "paused" | "interrupted" | "completed" | "ended" | "budget_exhausted";
        objective: string;
        phase: string;
        round: number;
        batch: string[];
        batchCompleted: number;
        tokens: number;
        usageKnown: boolean;
        unreportedBudgetEstimate?: number;
        reason: string | null;
        modelId: string;
        currentNodeId: string | null;
        settings: import("@sciencediscovery/schema").IdeaResearchSettings;
        template?: import("@sciencediscovery/schema").IdeaResearchTemplate;
        message?: undefined;
        candidates: {
            id: string;
            hypothesis: string;
            status: "done" | "failed" | "needs_retry" | "pending" | "running";
            score: number | null;
            insight: string | null;
        }[];
        insight: string | null | undefined;
    }>;
    close(): void;
};
