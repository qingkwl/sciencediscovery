import { DurableContextStore, type AgentScope, type ContextAssemblyMode, type ContextContributorFactory, type StateProvider } from "@sciencediscovery/context";
import { streamModelTurn, type ModelEndpoint } from "@sciencediscovery/model";
import type { Agent, AgentHistoryMessage } from "@sciencediscovery/orchestration";
import type { PlanStore } from "@sciencediscovery/plan";
import type { EvolveToolRuntime } from "@sciencediscovery/evolve";
import { ToolRegistry, type AgentTool } from "@sciencediscovery/tools";
import { type WorkspaceAgentOptions, type RuntimeSkill, type WorkspacePromptPart } from "@sciencediscovery/workspace";
import { type AgentVersioningOptions } from "./versioning.js";
export declare const DEFAULT_AGENT_IDLE_TIMEOUT_MS = 240000;
export declare const DEFAULT_AGENT_TURN_TIMEOUT_MS = 0;
export declare function configuredMaxParallelToolCalls(raw?: string | undefined): number;
export interface NativeAgentOptions extends WorkspaceAgentOptions {
    versioning?: AgentVersioningOptions;
    /** Stable identity for logging/tracing; use the session id. */
    sessionId: string;
    /** The caller's turn budget. A value above the engine ceiling is accepted and
     *  clamped to it; the effective bound is what the loop enforces and what the
     *  handoff reports (#1106). */
    maxModelTurns?: number;
    /** Hard deadline for one complete run, including streamed output. */
    runTimeoutMs?: number;
    /** Maximum time without model-stream progress (tool waits pause it via beginExternalWait). */
    runIdleTimeoutMs?: number;
    /** Canonical wire-format transcript handed off by a preceding AgentRun. */
    gatewayHistory?: AgentHistoryMessage[];
    /** Runtime-pinned request/task contract preserved outside compactable history. */
    runContract?: string;
    /** Internal composition seam; production defaults to SCIENCE_AGENT_CONTEXT_MODE. */
    contextAssemblyMode?: ContextAssemblyMode;
    /** Explicit role used to select scoped contributors. */
    contextScope?: AgentScope;
    /** Capability-package extension seam; factories are instantiated and frozen per AgentRun. */
    contextContributorFactories?: readonly ContextContributorFactory<WireMessage>[];
    stateProviders?: readonly StateProvider[];
    disabledPlugins?: readonly string[];
    pluginSettings?: import("@sciencediscovery/plugin-sdk").PluginSettingsMap;
    /** Run-scoped Plan snapshot projection; when present, registers update_plan and context injection. */
    /** The `/evolve-design` capability for this turn, or absent when the deployment has
     *  none. One object instead of two forwarded callbacks and a deps bundle
     *  threaded through three run-loop entry points. */
    evolve?: EvolveToolRuntime;
    planStore?: PlanStore;
    suspendAfterTurn?: () => boolean | Promise<boolean>;
}
export interface NativeAgentRunResult {
    finalMessages: AgentHistoryMessage[];
    suspended?: boolean;
}
export interface NativeAgentHandle extends Agent {
    execute(text: string): Promise<NativeAgentRunResult>;
    /** The turn bound this loop was composed with, after the ceiling clamp. The
     *  caller records this rather than re-deriving it, so the number reported for a
     *  run is the number that ran. Absent on an executor that cannot name a bound
     *  (the JiuwenSwarm backend leaves the turn budget to its own loop)
     *  (#1106, #1113 review). */
    readonly enforcedMaxModelTurns?: number;
}
/** Test seam: replaces the model-turn transport without a live endpoint. */
export type ModelTurnStreamer = typeof streamModelTurn;
export declare function setModelTurnStreamerForTest(streamer: ModelTurnStreamer): () => void;
type WireMessage = AgentHistoryMessage;
/** The model endpoint a run talks to; shared by every executor so a model is reached the same way. */
export declare function modelEndpointFor(options: Pick<NativeAgentOptions, "config">): ModelEndpoint;
export declare function formatRunContract(contract: string): string;
/**
 * Start the plugin scope for a run: the plugin-contributed tools (plan, subagent
 * dispatch, evolve, ...) live here, not in buildTools. Shared by every executor.
 * `runSubagent` lets the caller observe delegated children.
 */
export declare function startPluginScope(options: NativeAgentOptions, durable: DurableContextStore, signal: AbortSignal, runSubagent?: WorkspaceAgentOptions["runSubagent"]): Promise<{
    readonly manifests: readonly import("@sciencediscovery/plugin-sdk").PluginManifest[];
    readonly status: {
        id: string;
        installed: true;
        available: boolean;
        enabled: boolean;
        authorized: boolean;
        diagnostics: import("@sciencediscovery/plugin-sdk").PluginDiagnostic[];
        active: boolean;
    }[];
    contributions: readonly import("@sciencediscovery/plugin-sdk/runtime").RuntimeContribution<import("@sciencediscovery/runtime-core").RuntimeMessage>[];
    start(signal: AbortSignal): Promise<void>;
    dispose(): Promise<void>;
}>;
/** Every execution tool one run gets: the workspace tools plus what plugins contribute. */
export declare function pluginTools(plugins: Awaited<ReturnType<typeof startPluginScope>>): AgentTool[];
/**
 * The registry every run dispatches tool calls through: the workspace and plugin tools plus the
 * tool-output reader, with the output guard (size bounds, references for oversized results),
 * detail sanitisation, neutralisation of untrusted remote content and loop protection. Shared by
 * every executor so a tool behaves the same wherever the model loop runs.
 */
export declare function createToolRegistry(options: NativeAgentOptions, plugins: Awaited<ReturnType<typeof startPluginScope>>, durable: DurableContextStore, hooks?: {
    onProgress?: (call: import("@sciencediscovery/runtime-core").RuntimeToolCall, chunk: string) => void;
    recordResult?: (input: Parameters<NonNullable<ConstructorParameters<typeof ToolRegistry<WireMessage>>[1]["recordResult"]>>[0]) => Promise<void>;
}): ToolRegistry<WireMessage>;
/**
 * The system prompt an agent for these options gets, and its parts. Shared by every
 * executor so the model is told the same thing wherever the loop runs.
 */
export declare function composeSystemPrompt(options: NativeAgentOptions, toolNames: ReadonlySet<string>, promptSkills: RuntimeSkill[], toolPromptSections?: readonly string[]): {
    parts: WorkspacePromptPart[];
    systemPrompt: string;
};
export declare function buildTools(options: NativeAgentOptions): AgentTool[];
export declare function createNativeAgent(options: NativeAgentOptions): NativeAgentHandle;
export {};
