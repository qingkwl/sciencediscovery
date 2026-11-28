import type { RemoteWorkspaceSyncRecord, RemoteWorkspaceSyncRequest, WorkspaceTransfer } from "@sciencediscovery/schema";
import type { RunnerClient } from "@sciencediscovery/executor";
import type { SessionStore } from "./store.js";
export declare function remoteWorkspaceKey(projectId: string, sessionId: string, namespace?: string, agentId?: string): string;
/** Compatibility adapter: the old synchronous surface now waits for the same
 * durable Transfer as the management tool, never reading mutable source files. */
export declare function syncRemoteWorkspace(options: {
    hostId: string;
    /** Trusted control-plane ownership, never taken from model-supplied paths. */
    agentId?: string;
    workspaceRoot?: string;
    input: RemoteWorkspaceSyncRequest;
    runnerClient: RunnerClient;
    sessionId: string;
    store: SessionStore;
    signal?: AbortSignal;
}): Promise<{
    files: string[];
    record: RemoteWorkspaceSyncRecord;
    transfer: WorkspaceTransfer;
}>;
