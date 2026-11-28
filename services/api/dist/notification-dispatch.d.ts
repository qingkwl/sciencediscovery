import type { AgentShellExecution, RuntimeNotice, SessionRun } from "@sciencediscovery/schema";
import type { SessionStore } from "./store.js";
import type { NotificationBatch } from "./agent-notifications.js";
/** An automatic wake that follows a run the API interrupted. The interrupted
 * run is attempt 1, so the first wake after it is attempt 2. */
export interface InterruptionResume {
    /** The run whose interruption this wake follows. */
    runId: string;
    /** 1-based attempt number of this wake in the interruption chain. */
    attempt: number;
}
export declare function notificationPrompt(batch: NotificationBatch, resume?: InterruptionResume): string;
/** The transcript record for a delivery: model-facing text plus what the UI
 * shows instead of that text. `executions` is the owner's execution catalog,
 * consulted so each execution record names its Runner and outcome. */
export declare function runtimeNotice(batch: NotificationBatch, executions?: readonly Pick<AgentShellExecution, "id" | "runnerId" | "state">[], resume?: InterruptionResume): RuntimeNotice;
/** The inbox is the busy queue. Only an idle owner acquires a new model turn. */
export declare class NotificationDispatcher {
    private readonly store;
    private readonly enqueue;
    private readonly schedule;
    private polling;
    private closed;
    constructor(store: SessionStore, enqueue: (batch: NotificationBatch) => Promise<SessionRun | undefined>, schedule: (sessionId: string) => void);
    close(): void;
    tick(): Promise<void>;
}
