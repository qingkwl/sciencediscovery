import type { AgentEvent, AgentHistoryMessage, AgentProfile, AgentRunInput, AgentRunResult } from "@sciencediscovery/orchestration";
import type { ContextContributorFactory } from "@sciencediscovery/context";
import type { WorkspaceAgentOptions } from "@sciencediscovery/workspace";
import type { PlanStore } from "@sciencediscovery/plan";
import { type NativeAgentHandle, type NativeAgentOptions } from "../native-agent/index.js";
export interface AgentRunBindings {
    pluginSettings?: import("@sciencediscovery/plugin-sdk").PluginSettingsMap;
    disabledPlugins?: readonly string[];
    abortSignal?: AbortSignal;
    createAgent?: (options: NativeAgentOptions) => NativeAgentHandle;
    contextContributorFactories?: readonly ContextContributorFactory<AgentHistoryMessage>[];
    observer?: (event: AgentEvent) => void;
    recordEvent?: (event: import("@sciencediscovery/schema").RunStreamEvent) => Promise<void>;
    planStore?: PlanStore;
    runIdleTimeoutMs?: number;
    readVersioningAuthorities?: () => Promise<unknown>;
    suspendAfterTurn?: () => boolean | Promise<boolean>;
    workspace: WorkspaceAgentOptions;
}
export interface AgentRunHandle {
    abort(): void;
    beginExternalWait(): () => void;
    execute(): Promise<AgentRunResult>;
    /** The turn bound the executor actually enforced, when it can name one. A
     *  native loop reports its composed bound; an external runtime cannot, so the
     *  caller keeps the configured value there (#1113 review). */
    readonly enforcedMaxModelTurns?: number;
}
export declare function createAgentRun(profile: AgentProfile, bindings: AgentRunBindings, input: AgentRunInput): AgentRunHandle;
