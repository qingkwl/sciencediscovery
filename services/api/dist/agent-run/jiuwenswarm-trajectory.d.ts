import { type StateProvider } from "@sciencediscovery/context";
import type { ModelTurn } from "@sciencediscovery/model";
import type { AgentEventEvidence } from "@sciencediscovery/schema";
import type { NativeAgentOptions } from "../native-agent/index.js";
import type { ModelCallIdentity } from "./jiuwenswarm-model-gateway.js";
/** What the model was given for one call: the system prompt, the conversation and the tools, as sent. */
export interface ModelCallInput {
    history: unknown[];
    systemPrompt: string;
    tools: unknown[];
    /** The identity the gateway minted for this call, when it named it. */
    call?: ModelCallIdentity;
}
/** One component of a state checkpoint, identified and hashed the way the built-in loop does its own. */
export declare function stateProvider(id: string, read: () => unknown | Promise<unknown>, fidelity?: "captured" | "reference-only"): StateProvider;
/**
 * The run's trajectory, recorded as the built-in loop records it, for the JiuwenSwarm executor.
 *
 * JiuwenSwarm owns the loop, but every model call passes through the run's model gateway and every tool result
 * through this process, so the same `AgentVersionRecorder` records each turn: the exact model input before the
 * call, the model's answer after it, the tool observations, and the step once the next call (or the end of the
 * run) shows the turn is over. Events are tagged with the recorder's evidence, which is how the trajectory view
 * ties them to the model input they belong to.
 */
export declare class JiuwenSwarmTrajectory {
    private readonly recorder?;
    /**
     * `modelRequest` increments before it records, so this starts one below the first turn number.
     * The built-in loop counts `for (let turn = 0; …)`, and the trajectory's own readers rely on that
     * number meaning the same thing under either executor — an export marks where a Run began by its
     * turn-0 records, which numbering from 1 left with no turn 0 at all.
     */
    private turn;
    /**
     * The response id this call announced, captured synchronously from
     * `assistant.response.started` and handed to the completion record as data.
     * The recorder's own field is cleared from inside the recording queue, so
     * reading it when that queue drains could lose the id for the call that had
     * just answered (#1133).
     */
    private callResponseId?;
    /** Ids the completion records for a turn carry, awaiting that turn's announcement. */
    private readonly recordedResponseIds;
    /** The turn each dispatched call was given, keyed by the identity the gateway minted for it. */
    private readonly callTurns;
    private sequence;
    private pending?;
    private readonly results;
    private queue;
    private readonly readRuntime;
    private readonly readAuthorities;
    private readonly trajectoryId;
    private readonly sessionId;
    private stateCapture?;
    constructor(options: NativeAgentOptions, readRuntime?: () => unknown);
    /**
     * The component states this run's turns are recorded against.
     *
     * A state snapshot carries a `checkpoint` — the component ids, revisions and fidelity the trajectory
     * viewer lists under "Component states" — only when the state was assembled through a `StateView`.
     * The built-in loop builds that view inside its context assembler; JiuwenSwarm owns the loop, so
     * nothing on this path ever built one and every snapshot went out without a checkpoint at all. The
     * components are in this process regardless (the same tool registry, the same durable context, the
     * same workspace), so they are captured here instead.
     *
     * What this checkpoint claims is narrower than the built-in loop's, and deliberately so: there it
     * records the state the turn was *assembled from*, while here it records the state read at the call
     * — JiuwenSwarm assembled the prompt itself, out of process. `tools` is ScienceDiscovery's registry,
     * which is what the bridge exposes and what every tool result came back through; JiuwenSwarm's own
     * native tools do not pass through it and are not in it.
     */
    useStateProviders(input: {
        providers: readonly StateProvider[];
        scope: string;
        signal: AbortSignal;
    }): void;
    /**
     * Recording must not end a run that is otherwise fine. Without a view the snapshot is exactly what
     * it was before any of this existed, minus the checkpoint, and the reason is logged rather than lost.
     */
    private captureState;
    get enabled(): boolean;
    start(behavior: unknown): Promise<void>;
    /** Serialized: JiuwenSwarm can overlap requests (a title while the turn runs); the recorder takes one at a time. */
    private stage;
    private run;
    /** A model call is about to be made: the turn before it is over, and this one begins with its exact input. */
    modelRequest(input: ModelCallInput): Promise<void>;
    /** The model answered the call named by `call`, if the gateway named it. */
    modelCompleted(turn: ModelTurn, history: unknown[], call?: ModelCallIdentity): Promise<void>;
    /** A tool finished (one of ours, through the bridge, or one of JiuwenSwarm's own). */
    observe(input: {
        call: {
            args: unknown;
            id: string;
            name: string;
        };
        content: string;
        details?: unknown;
        isError: boolean;
    }): Promise<void>;
    /** The evidence an event carries: which run, turn, response and model input it belongs to. */
    evidence(event: {
        type: string;
        responseId?: unknown;
        turn?: unknown;
    }): AgentEventEvidence | undefined;
    /** The run ended: commit the last turn and let the records reach the run's stream. */
    finish(): Promise<void>;
    private commitPending;
}
