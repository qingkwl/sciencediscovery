import { type RecordingIdentity } from "../agent-run/recording-wait.js";
import { VersionStore, type AgentStateRef } from "@sciencediscovery/cas";
import type { RuntimeMessage, RuntimeToolCall, RunEvent, TurnLifecycle } from "@sciencediscovery/runtime-core";
import type { StateCheckpoint, StateView, StateProvider } from "@sciencediscovery/context";
import type { AgentEventEvidence, RunStreamEvent } from "@sciencediscovery/schema";
export interface AgentVersioningOptions {
    agentId: string;
    trajectoryId: string;
    requestExecutionId: string;
    /** Authority adapter, not a reconstruction from truncated model messages. */
    readAuthorities?: () => Promise<unknown>;
    /** The host's existing persisted Run stream, not a second trajectory log. */
    recordEvent?: (event: RunStreamEvent) => Promise<void>;
}
export interface AgentManifest {
    harness: AgentStateRef;
    behavior: unknown;
}
export interface AgentRevision {
    agentId: string;
    trajectoryId: string;
    requestExecutionId: string;
    manifest: AgentStateRef;
    parentRevision: AgentStateRef | null;
}
export interface ModelContextSnapshot<I = unknown> {
    boundary: "ProviderModelClient.invoke";
    input: I;
}
export interface ContextAssemblyRecord {
    capturedAt?: string;
    checkpoint?: StateCheckpoint;
    turn: number;
    manifest: AgentStateRef;
    state: AgentStateRef;
    modelContext: AgentStateRef;
    trace: unknown;
}
export interface AgentStateSnapshot {
    checkpoint?: StateCheckpoint;
    agentId: string;
    trajectoryId: string;
    turn: number;
    phase: "before" | "after";
    manifest: AgentStateRef;
    agentRevision: AgentStateRef;
    predecessor: AgentStateRef | null;
    workspace: AgentStateRef;
    transcript: RuntimeMessage[];
    history: RuntimeMessage[];
    runtime: unknown;
    authorities: unknown;
    observations: AgentStateRef[];
    forkFidelity: {
        component: string;
        fidelity: "restorable" | "reference-only" | "external-side-effect";
        detail: string;
    }[];
}
/** Convert optional object fields to their existing JSON wire semantics before strict JCS. */
export declare function jsonValue<T>(value: T): T;
export declare function harnessBuildDigest(): Promise<AgentStateRef["digest"]>;
export declare function agentHeadName(agentId: string): string;
export declare class AgentStateAssembler {
    private readonly store;
    private readonly workspaceRoot;
    private readonly readRuntime;
    private readonly readAuthorities;
    private readonly identity;
    constructor(store: VersionStore, workspaceRoot: string, readRuntime: () => unknown, readAuthorities: () => Promise<unknown>, identity?: RecordingIdentity);
    captureWorkspace(): Promise<AgentStateRef>;
    assemble(input: Omit<AgentStateSnapshot, "workspace" | "runtime" | "authorities" | "forkFidelity">, view?: StateView): Promise<AgentStateRef>;
}
export declare class AgentVersionRecorder<M extends RuntimeMessage, I, U> implements TurnLifecycle<M, I, U> {
    readonly options: AgentVersioningOptions;
    readonly store: VersionStore;
    private refs;
    private coordinator;
    private manifest;
    private revision;
    private head;
    private before;
    private modelContext;
    private modelAction?;
    private context;
    private activeContext?;
    private transcript;
    private observations;
    private turnObservations;
    private children;
    private assemblyTrace;
    private currentTurn;
    private responseId?;
    /** The turn
  esponseId was announced for, so a late id is only reused by its own record. */
    private responseIdTurn?;
    private pending;
    private readonly assembler;
    private inputView?;
    constructor(dataDir: string, workspaceRoot: string, options: AgentVersioningOptions, readRuntime: () => unknown);
    initialize(behavior: unknown, history: M[]): Promise<void>;
    beforeTurn({ turn, history }: Parameters<TurnLifecycle<M, I, U>["beforeTurn"]>[0]): Promise<void>;
    trace(record: unknown): void;
    workspaceStateProvider(): StateProvider;
    captureInputState(view: StateView, turn: number, history: M[]): Promise<void>;
    afterAssembly({ turn, assembly }: Parameters<TurnLifecycle<M, I, U>["afterAssembly"]>[0]): Promise<void>;
    recordObservation(input: {
        call: RuntimeToolCall;
        content: string;
        details?: unknown;
        isError: boolean;
        sequence: number;
    }): Promise<void>;
    event(event: RunEvent<U>): AgentEventEvidence;
    modelCompleted(result: unknown, identity?: {
        turn?: number;
        responseId?: string;
    }): Promise<void>;
    /**
     * Evidence for a completion record, bound to the call that produced it.
     *
     * A caller that knows the response id passes it — the executor does, because
     * it is the side that sees `assistant.response.started`. A supplied id wins
     * over the recorder's field. Without one, the recorder's own value is used:
     * a tool-only call has its response opened later, and dropping that late id
     * would leave the record exactly as anonymous as the rows #1133 measured.
     */
    private completedEvidence;
    childCompleted(agentId: string): void;
    afterTurn({ turn, history, modelTurn, results }: Parameters<TurnLifecycle<M, I, U>["afterTurn"]>[0]): Promise<void>;
    private evidence;
    private record;
    /** Drain supplemental records even after failure, without advancing the Agent head. */
    flushEvents(): Promise<void>;
    close(): void;
    private state;
}
