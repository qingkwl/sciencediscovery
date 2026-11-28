import { type PermissionEpoch, type SandboxNetworkPermissionResult, type ScientificExecutionResult } from "@sciencediscovery/schema";
import type { AgentPermissionRuntime } from "@sciencediscovery/governance";
import type { SessionStore } from "../store.js";
/** Owned by one binding, never the shared root permission cell or Session epoch. */
export declare function createSandboxNetworkConsent(options: {
    sessionId: string;
    agentId: string;
    executionId: string;
    rootRunId?: string;
    store: SessionStore;
    permission: AgentPermissionRuntime;
    assertRunner(runnerId: string): void;
}): {
    request: (input: {
        hosts: string[];
        purpose: string;
        runnerId?: string;
    }, signal?: AbortSignal, toolCallId?: string) => Promise<SandboxNetworkPermissionResult>;
    consume(id: string | undefined, runnerId: string, signal?: AbortSignal): Promise<PermissionEpoch>;
    observe<T extends Pick<ScientificExecutionResult, "networkDeniedHosts" | "networkPermission">>(result: T, runnerId: string, signal?: AbortSignal): Promise<T & {
        networkPermission?: SandboxNetworkPermissionResult;
    }>;
};
