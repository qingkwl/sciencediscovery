import { ApiStatusError } from "../http/api-status-error.js";
export { ApiStatusError };
import { type IncomingMessage, type ServerResponse } from "node:http";
import type { EvolveToolRuntime } from "@sciencediscovery/evolve";
import type { ApprovalMode, ChatMessage, MemoryGraphTraceResult, EffectiveRuntimeSettings, RunStreamEvent, RuntimeSessionRun, CreateSkillEvolutionRunRequest, SendMessageRequest, SessionRun, SessionRunEvent, SessionRunStatus, ToolTrace, PermissionRequest, SubagentStep } from "@sciencediscovery/schema";
import { type IdeaTreeAuthorityRegistry, type IdeaTreePersistence } from "@sciencediscovery/idea-tree";
import { SessionStore } from "../store.js";
import { RunnerClient } from "@sciencediscovery/executor";
import { ProvenanceRecorder } from "@sciencediscovery/provenance";
import { MemoryGraphClient, MemoryGraphSink } from "@sciencediscovery/memory";
import type { SkillLibraryCatalog } from "../skill-library-catalog.js";
import { createBuiltinMcpSourceRegistry } from "@sciencediscovery/mcp-sources";
import { GovernedDownloadManager } from "@sciencediscovery/artifact-manager";
import { McpGovernanceBroker } from "@sciencediscovery/data-source";
import { McpSourceCatalog } from "@sciencediscovery/data-source";
import { WebBroker } from "@sciencediscovery/data-source";
import { SkillCatalog } from "@sciencediscovery/specialist";
import { PaperService } from "../papers.js";
import { RemoteComputeClient } from "@sciencediscovery/executor";
export declare function cloneRunEventDetails(details: unknown): unknown | undefined;
type ToolExecutionEndRunEvent = {
    isError: boolean;
    result: {
        content?: unknown;
        details?: unknown;
    };
    toolCallId: string;
    toolName: string;
    type: "tool_execution_end";
};
export declare function buildCompletedToolTrace(event: ToolExecutionEndRunEvent, text?: string | undefined): ToolTrace;
/** Bounded head/tail snapshot; full main-tool transcripts remain delta streams. */
export declare function appendToolProgress(previous: string, chunk: string): string;
export declare function buildSubagentToolStep(event: ToolExecutionEndRunEvent, runningStep?: SubagentStep): SubagentStep;
import type { NotificationBatch } from "../agent-notifications.js";
import { type ServerConfig } from "../bootstrap/config.js";
export declare const DEFAULT_SELF_EVOLUTION_LIBRARY_ID = "project-skills";
export declare const SKILL_EVOLUTION_PROMPT_MARKER = "[Skill self-evolution M1.6]";
/**
 * How far an event travels.
 *
 * A transient event reaches live subscribers and stops there. Streamed
 * subagent text uses it: the run stream would otherwise keep one cumulative
 * snapshot per interval of a message it already stores once at the end, and
 * the durable copy a reload reads back is the Subagent record the progress
 * flush writes, not this stream.
 */
interface RunEventDelivery {
    transient?: boolean;
}
type RunEventSink = (event: RunStreamEvent, delivery?: RunEventDelivery) => void | Promise<void>;
/** Stop only this Agent instance; its parent and sibling Agents remain available. */
export declare function stopSessionSubagent(store: SessionStore, sessionId: string, subagentId: string): boolean;
/** Empty match-response shape with a degradation reason (feature off / unreachable). */
export declare function emptyMatch(reason: "memory_graph_disabled" | "memory_graph_unreachable"): {
    hits: unknown[];
    total: number;
    truncated: boolean;
    reason: "memory_graph_disabled" | "memory_graph_unreachable";
};
/** Empty trace-response shape with a degradation reason. A disabled or
 * unreachable graph surfaces as ``broken:true`` (chain not verifiable) so the
 * reviewer marks the artifact for manual verification rather than treating an
 * outage as an intact chain. Mirrors the sidecar's degraded-trace shape. */
export declare function emptyTrace(reason: "memory_graph_disabled" | "memory_graph_unreachable"): MemoryGraphTraceResult;
/** Preserve the original research objective when ScienceMemory is enabled
 * after a session has already begun. Runtime wake notices are not user goals. */
export declare function firstUserAuthoredMessage(previousMessages: ChatMessage[], currentMessage: ChatMessage): ChatMessage | undefined;
export declare function emitWorkspaceChanges(options: {
    emit: (event: RunStreamEvent) => void | Promise<void>;
    previous: Map<string, string>;
    sessionId: string;
    store: SessionStore;
}): Promise<Map<string, string>>;
/**
 * Strip a trailing ``#vN`` version suffix some models append to the artifact_id
 * in ``cites_artifact_aliases`` (e.g. ``"67c0ce25-…#v1"``). The schema splits
 * the two — ``cites_artifact_aliases`` carries the bare UUID, ``cites_artifact_versions``
 * carries the int — but a model may collapse them into one string. Returns the
 * bare id and, when a ``#vN`` suffix is present, the version it encoded (so the
 * explicit version the LLM intended survives rather than falling back to latest).
 * A bare UUID with no suffix returns ``version: undefined``.
 */
export declare function splitArtifactVersionSuffix(raw: string): {
    id: string;
    version: number | undefined;
};
/**
 * Builds the `/evolve-design` capability for one turn, or nothing when the deployment
 * has none.
 *
 * A factory rather than a dependency bundle: `emit`, `beginExternalWait` and
 * `sessionId` belong to the turn, not the process, so the composition root
 * cannot hand over a finished object the way it hands over `planRepository`.
 * What it *can* do is hand over one function — and that is the whole seam.
 *
 * Declared `| undefined` rather than `?` on purpose. It still travels through
 * `executeAgentRun`, `scheduleSessionRuns` and `streamAgentRun` as a positional
 * parameter, and while it was optional a new route could be added without it
 * and lose the tools with no type error — silently, because the model does not
 * report a missing tool, it hand-rolls a search instead. Required-but-nullable
 * makes that omission a compile error while still letting a deployment without
 * the evolve sidecar pass `undefined` and offer nothing.
 */
export type EvolveRuntimeFactory = (context: EvolveTurnContext) => EvolveToolRuntime | undefined;
/** What the capability needs from the turn that is running it. */
export interface EvolveTurnContext {
    thinkingMode?: EffectiveRuntimeSettings["thinkingMode"];
    thinkingEffort?: EffectiveRuntimeSettings["thinkingEffort"];
    approvalMode?: "always_allow" | "ask_for_dangerous";
    /** Publishes `evolve_run.created` into the turn's event stream. */
    emit: RunEventSink;
    /** Pauses the agent's idle clock: the discrimination probe runs real
     *  sandboxed evaluations and outlasts it. */
    beginExternalWait?: () => (() => void);
    modelId: string;
    sessionId: string;
}
/**
 * Whether a Session holds a conversation — something a Skill could be distilled
 * from. Messages are the only evidence here: a cancelled wake run can leave
 * executions with no message at all, so this does not speak for execution
 * history.
 *
 * Not a plain role test: runtime wake and manual-review notices are stored with a
 * user or assistant role and a `kind`, so a Session that has only ever been woken
 * would otherwise look like it had history. `firstUserAuthoredMessage` draws the
 * same line for the research objective.
 */
export declare function hasConversation(messages: readonly ChatMessage[]): boolean;
/**
 * The instruction an authoring slash command becomes.
 *
 * `hasHistory` is false for a Session with no prior conversation. `/distill-session`
 * then has nothing to infer, and the unguarded wording ("infer the reusable
 * workflow from the complete prior Session conversation ... supplied above") sent
 * the model looking for that conversation with `run_shell` — 28 shell calls, 32
 * turns and ~89k tokens on an empty Session, with no draft (#1262). The sibling
 * `/skill-creator` branch already guards its missing description; this mirrors it.
 */
export declare function skillAuthoringCommandPrompt(content: string, options?: {
    hasHistory?: boolean;
}): string | undefined;
export declare function nativeConfigurationDecisionPrompt(store: SessionStore, sessionId: string, run: SessionRun): string;
export declare function isTerminalRunStatus(status: SessionRunStatus): boolean;
export declare function sessionHasActiveRun(store: SessionStore, sessionId: string): Promise<boolean>;
export declare function sessionHasActiveRunExceptConfigurationWait(store: SessionStore, sessionId: string, requestId: string): Promise<boolean>;
export declare function cancelQueuedRunBeforeExecution(store: SessionStore, sessionId: string, runId: string): Promise<SessionRun | undefined>;
export declare function cancelCurrentSessionRun(response: ServerResponse, store: SessionStore, sessionId: string, legacyResponse?: boolean): Promise<void>;
export interface DeltaCoalescingSink {
    emit: RunEventSink;
    /** Publish whatever is buffered; run teardown must call this before the terminal status. */
    flush(): Promise<void>;
}
/**
 * Streamed text arrives token-sized, but every published record pays a fixed
 * envelope in the JSONL stream. Buffer consecutive same-stream deltas and
 * publish one merged record per window: the text is concatenated exactly, so
 * nothing is lost except transport chunk boundaries. The buffer key includes
 * the response identity, so a new response flushes the previous one first —
 * merged text never crosses a model-response boundary. Any non-delta event
 * flushes first, which keeps tool/permission ordering intact.
 */
export declare function createDeltaCoalescingSink(publish: RunEventSink, windowMs?: number, maxChars?: number): DeltaCoalescingSink;
export declare function toolOutputStreamId(toolCallId: string): string;
export declare function subagentStreamId(subagentId: string): string;
/**
 * Write the resolutions a decision recorded in the catalog onto the run stream.
 *
 * Most requests are answered by the run that asked: it polls for the answer
 * and publishes `permission.resolved` itself. The ones decided outside a run's
 * own wait — artifact downloads, remote jobs, and every pending request an
 * approval-mode switch settles — have no such poller, so without this the
 * decision reached only the catalog. A reloaded Session then replays the
 * request as still pending: a card whose buttons can never work.
 *
 * A publishing failure is logged and swallowed. The decision is already
 * committed; losing its audit line must not turn a successful authorization
 * into an HTTP error.
 */
export declare function publishResolvedPermissions(store: SessionStore, sessionId: string, requests: readonly PermissionRequest[]): Promise<void>;
/**
 * Persist an event where it belongs before fanning it out to live subscribers.
 * Growable payloads (tool output, subagent process steps) land in the run's
 * child streams and are broadcast without a main-stream sequence; the catalog's
 * subagent records stay a panel projection of the step stream. The slim
 * subagent milestone keeps the main timeline free of repeated step snapshots.
 */
export declare function publishRunEvent(store: SessionStore, sessionId: string, runId: string, event: RunStreamEvent, delivery?: RunEventDelivery): Promise<SessionRunEvent>;
/**
 * Put an approval-policy switch on the run timeline the user reads it back on.
 * The in-flight run owns the entry while one is streaming — that is the run
 * whose later tool calls the new policy judges. A switch made between runs is
 * recorded on the Session's newest started run instead, so it is still replayed
 * after a reload; a Session that has never started a run has no timeline to
 * carry it and keeps only the Permission Epoch as its audit record.
 */
export declare function publishApprovalModeChange(store: SessionStore, sessionId: string, change: {
    approvalMode: ApprovalMode;
    permissionEpochId: string;
    previousApprovalMode: ApprovalMode;
}): Promise<SessionRunEvent | undefined>;
export declare function computeSettingsSnapshot(store: SessionStore, sessionId: string): SessionRun["settingsSnapshot"];
/** Recovery-safe handoff for any resolved configuration interaction. */
export declare function ensureConfigurationContinuation(store: SessionStore, sessionId: string, requestId: string): Promise<SessionRun | undefined>;
/** Compatibility export for historical connector callers. */
export declare const ensureConnectorContinuation: typeof ensureConfigurationContinuation;
export declare function createQueuedRun(store: SessionStore, skillCatalog: SkillCatalog, skillLibraryCatalog: SkillLibraryCatalog, ideaTreeAuthorities: IdeaTreeAuthorityRegistry, sessionId: string, body: SendMessageRequest, ideaTreeRepository: IdeaTreePersistence): Promise<SessionRun>;
export declare function createSkillEvolutionRun(store: SessionStore, skillCatalog: SkillCatalog, skillLibraryCatalog: SkillLibraryCatalog, ideaTreeAuthorities: IdeaTreeAuthorityRegistry, ideaTreeRepository: IdeaTreePersistence, sessionId: string, sourceRunId: string, request?: CreateSkillEvolutionRunRequest): Promise<SessionRun>;
/** The reason recovery writes when the API process itself ended a run. It is
 * the run-data marker that separates a restart interruption from the other
 * paths that also persist `interrupted`. */
export declare const RECOVERY_INTERRUPTION_REASON = "API process exited before this run reached a terminal state";
export declare function createNotificationRun(store: SessionStore, skillLibraryCatalog: SkillLibraryCatalog, batch: NotificationBatch): Promise<SessionRun | undefined>;
export declare function scheduleSessionRuns(store: SessionStore, runnerClient: RunnerClient, provenanceRecorder: ProvenanceRecorder, mcpBroker: McpGovernanceBroker, webBroker: WebBroker, mcpRegistry: ReturnType<typeof createBuiltinMcpSourceRegistry>, mcpCatalog: McpSourceCatalog, artifactManager: GovernedDownloadManager, paperService: PaperService, remoteCompute: RemoteComputeClient, skillCatalog: SkillCatalog, skillLibraryCatalog: SkillLibraryCatalog, ideaTreeAuthorities: IdeaTreeAuthorityRegistry, ideaTreeRepository: IdeaTreePersistence, memoryGraphSink: MemoryGraphSink, sessionId: string, serverConfig: ServerConfig, memoryGraphClient: MemoryGraphClient | null, evolve: EvolveRuntimeFactory | undefined, executionGovernance?: ExecutionGovernance): Promise<void>;
export declare function recoverSessionRuns(store: SessionStore, memoryGraphClient?: MemoryGraphClient | null): Promise<void>;
export declare function streamStoredRunEvents(response: ServerResponse, store: SessionStore, sessionId: string, runId: string, after: number, closeOnTerminal: boolean): Promise<void>;
/** [windows-desktop] F6 (gap 1a): run-scoped view of the execution router used for permission hardening. */
export interface ExecutionGovernance {
    /** True when the current execution provider is a real sandbox (Provider B/C). */
    sandboxed(): Promise<boolean>;
}
export declare function streamAgentRun(request: IncomingMessage, response: ServerResponse, store: SessionStore, runnerClient: RunnerClient, provenanceRecorder: ProvenanceRecorder, mcpBroker: McpGovernanceBroker, webBroker: WebBroker, mcpRegistry: ReturnType<typeof createBuiltinMcpSourceRegistry>, mcpCatalog: McpSourceCatalog, artifactManager: GovernedDownloadManager, paperService: PaperService, remoteCompute: RemoteComputeClient, skillCatalog: SkillCatalog, skillLibraryCatalog: SkillLibraryCatalog, ideaTreeAuthorities: IdeaTreeAuthorityRegistry, ideaTreeRepository: IdeaTreePersistence, memoryGraphSink: MemoryGraphSink, sessionId: string, body: SendMessageRequest, serverConfig: ServerConfig, memoryGraphClient: MemoryGraphClient | null, evolve: EvolveRuntimeFactory | undefined, executionGovernance?: ExecutionGovernance): Promise<void>;
export declare function getActiveSessionRun(sessionId: string): RuntimeSessionRun | undefined;
export declare function cancelSessionRun(response: ServerResponse, store: SessionStore, sessionId: string, runId: string): Promise<void>;
