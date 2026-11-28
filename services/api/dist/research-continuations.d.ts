import type { MemoryGraphClient } from "@sciencediscovery/memory";
import type { ResearchContinuationOperation } from "@sciencediscovery/schema";
import { type SessionStore } from "./store.js";
type Restore = (projectId: string, sessionId: undefined, bytes: Buffer, options: {
    operationId: string;
    sourceSessionId: string;
    sourceMessageId?: string;
}) => Promise<{
    importedSessionIds: string[];
    sessionMapping: Record<string, string>;
}>;
/** Durable request identities survive client disconnects and API restarts. */
export declare function createContinuationOperations({ store, memoryGraphClient }: {
    store: SessionStore;
    memoryGraphClient: MemoryGraphClient;
}, restore: Restore, prepareBranch?: (sessionId: string, messageId: string) => Promise<Uint8Array>): {
    startContinuation: (sourceSessionId: string, requestId: string) => Promise<ResearchContinuationOperation>;
    startConversationBranch: (sourceSessionId: string, sourceMessageId: string, requestId: string) => Promise<ResearchContinuationOperation>;
    getContinuation: (sourceSessionId: string, id: string) => Promise<ResearchContinuationOperation>;
    recoverContinuations: () => Promise<void>;
};
export {};
