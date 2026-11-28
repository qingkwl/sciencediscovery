import type { Environment } from "@sciencediscovery/schema";
import type { WorkspaceAgentOptions } from "@sciencediscovery/workspace";
import { type ProvenanceRecorder } from "@sciencediscovery/provenance";
import type { RunnerClient } from "@sciencediscovery/executor";
import type { SessionStore } from "../store.js";
import type { AgentPermissionRuntime } from "@sciencediscovery/governance";
type ExecutionBindings = Pick<WorkspaceAgentOptions, "sandboxNetwork" | "directExecution" | "environmentManagement" | "executePython" | "executeScientific" | "executeShell" | "npuBroker" | "observeNpuJob" | "workspaceTransfers" | "shellExecutions" | "timers" | "runnerReadiness">;
/**
 * A remote machine this Session is allowed to use. Resolution happens per call
 * rather than per run so a machine removed from the allowlist stops working
 * immediately, and so a run that never names one never touches SSH at all.
 */
export interface RemoteExecutionTarget {
    runnerId: string;
    hostAlias: string;
    /** Throws with an actionable message when the machine is no longer allowed or not connected. */
    runnerClient: () => RunnerClient;
    /** Logical workspace on that machine; keeps its files out of local provenance. */
    workspaceKey: string;
}
export interface WorkspaceExecutionBindingOptions {
    explicitHandoff?: boolean;
    beginExternalWait?: () => (() => void);
    agentId: string;
    rootRunId?: string;
    artifactPathPrefix?: string;
    executionId: string;
    executionTimeoutMs?: number;
    kernelIdleTimeoutMs?: number;
    maxOutputBytes?: number;
    maxWorkspaceBytes?: number;
    npuBrokerEnabled?: boolean;
    permission: AgentPermissionRuntime;
    /** The English suffix a permission summary uses for its scope ("in the
     *  Session workspace", "in subagent X"). A client localizes the same scope
     *  from `permissionSubagentId` rather than from this sentence. */
    permissionScopeLabel: string;
    /** Set only inside a subagent: the approval is scoped to that subagent's
     *  workspace rather than the Session workspace. */
    permissionSubagentId?: string;
    provenanceRecorder: ProvenanceRecorder;
    readOnlyWorkspaceRoot?: string;
    skillPackagesRoot?: string;
    /** The built-in Runner, used by default only when selected for this Session. */
    runnerClient: RunnerClient;
    remoteTargets?: RemoteExecutionTarget[];
    scientificEnvironments?: Environment[];
    sessionId: string;
    store: SessionStore;
    workspaceRoot: string;
    /** When set, this workspace runs inside a subagent: passed through to
     * provenanceRecorder.execute* so products hang off the subagent's child
     * SubTask instead of a per-execution SubTask. Absent in main-agent context. */
    parentSubagentId?: string;
}
/** Build the shared governed handlers; only identity and observability policy differ. */
export declare function createWorkspaceExecutionBindings(options: WorkspaceExecutionBindingOptions): ExecutionBindings;
export {};
