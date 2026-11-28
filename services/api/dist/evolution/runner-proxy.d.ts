import type { IncomingMessage, ServerResponse } from "node:http";
import type { ExecutionOwner, PermissionEpoch, ShellExecutionRequest } from "@sciencediscovery/schema";
interface RunnerGrant {
    executions: Map<string, string>;
    runId: string;
    sessionId: string;
    timeoutSeconds: number;
    token: string;
}
/** Tokens that may call the evolve-runner path. Separate from the model token. */
export declare class RunnerGrantRegistry {
    private readonly grants;
    issue(runId: string, sessionId: string, timeoutSeconds: number): string;
    revoke(runId: string): void;
    resolve(runId: string, presented: string | undefined): RunnerGrant | undefined;
}
export interface EvolveRunnerSession {
    effectiveRunnerIds(sessionId: string): string[];
    getRemoteHost(hostId: string): {
        workspaceNamespace?: string;
    } | undefined;
    getSession(sessionId: string): {
        projectId: string;
    } | undefined;
    getSessionPermissionEpoch(sessionId: string): PermissionEpoch | undefined;
    npuDeviceSelection(runnerId: string): number[];
    workspacePath(sessionId: string): string;
}
export interface EvolveRunnerCaller {
    cancelShellExecution(id: string, owner: ExecutionOwner): Promise<unknown>;
    getShellExecution(id: string, owner: ExecutionOwner): Promise<unknown>;
    startShellExecution(request: ShellExecutionRequest): Promise<unknown>;
}
export interface EvolveRunnerDeps {
    grants: RunnerGrantRegistry;
    runnerClient(runnerId: string): EvolveRunnerCaller;
    sessions: EvolveRunnerSession;
}
/** The first selected remote runner that is connected, or why there is none. */
export declare function connectedRunner(ids: readonly string[], connected: (id: string) => boolean): {
    runnerId: string;
} | {
    error: string;
};
/** Shell that runs the fixed Python program. The candidate is already bound in the source. */
export declare function shellForFixedProgram(pythonSource: string): string;
/**
 * Handle `/internal/evolve-runner/{runId}/shell-executions...`.
 * Returns false when the path is not this proxy.
 */
export declare function handleEvolveRunner(request: IncomingMessage, response: ServerResponse, url: URL, deps: EvolveRunnerDeps): Promise<boolean>;
export {};
