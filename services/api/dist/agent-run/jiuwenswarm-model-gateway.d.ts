import { streamModelTurn, type ModelClientPolicy, type ModelEndpoint, type ModelTurn, type ModelUsage, type WireToolSpec } from "@sciencediscovery/model";
/**
 * The model, as JiuwenSwarm sees it: an OpenAI chat-completions endpoint on loopback.
 *
 * JiuwenSwarm only speaks OpenAI chat completions to a model, while a ScienceDiscovery model may be
 * Anthropic Messages or OpenAI Responses, with a provider variant (DeepSeek, Gemini, Kimi, Qwen ...),
 * thinking controls, a network proxy and a retry policy. Those already live in the native model
 * client, so a run's model requests are served by it: JiuwenSwarm's request comes in as chat
 * completions, goes out through `streamModelTurn` in the model's own protocol, and the answer (text,
 * thinking, tool calls, usage) goes back as chat completions.
 */
export interface ModelGateway {
    /** Base URL to give JiuwenSwarm, up to and including `/v1`. */
    url: string;
    token: string;
    /**
     * The assistant message the model client produced for a turn, in place of the plain chat-completions
     * copy JiuwenSwarm rebuilt from it. The native message keeps what the provider needs sent back
     * verbatim (Anthropic thinking blocks with their signatures, Responses reasoning items), which
     * a chat-completions message cannot carry. Other messages come back unchanged.
     */
    restore<T extends Record<string, unknown>>(message: T): T;
    /** The last model turn served, for what the run's end has to say about it. */
    lastTurn(): {
        text: string;
        toolCalls: number;
        truncated: boolean;
        recoveryAttempts?: number;
    } | undefined;
    /** The last task turn whose tool calls were withheld because their arguments could not be used. */
    lastFailure(): {
        requestId: string;
        tools: string[];
        recoveryAttempts?: number;
    } | undefined;
    /** Payload-free metadata for active requests; never includes prompts or arguments. */
    diagnostics(): Array<{
        id: string;
        purpose: "task" | "auxiliary";
        phase: string;
        elapsedMs: number;
        upstreamChunks: number;
        downstreamChunks: number;
        upstreamIdleMs: number;
        downstreamIdleMs: number;
    }>;
    close(): Promise<void>;
}
type Streamer = typeof streamModelTurn;
type HistoryMessage = Parameters<Streamer>[2][number];
interface ChatRequest {
    model?: string;
    messages?: Array<Record<string, unknown>>;
    stream?: boolean;
    max_tokens?: number;
    max_completion_tokens?: number;
    temperature?: number;
    top_p?: number;
    thinking?: {
        type: string;
    };
    enable_thinking?: boolean;
    reasoning?: boolean;
    tool_choice?: unknown;
    parallel_tool_calls?: boolean;
    stream_options?: {
        include_usage?: boolean;
    };
    n?: number;
    /** MiniMax's chat-completions thinking flag, which Swarm writes for a MiniMax model. */
    reasoning_split?: boolean;
    tools?: Array<{
        function?: {
            description?: string;
            name?: string;
            parameters?: unknown;
        };
    }>;
}
export declare function toModelRequest(body: ChatRequest, restore?: ModelGateway["restore"]): {
    history: HistoryMessage[];
    systemPrompt: string;
    tools: WireToolSpec[];
};
/**
 * Text Swarm streamed for display, without the withheld-response notice. The notice is meant for the
 * recovery boundary only; the gateway writes it as the response's last text delta, so it runs to the
 * end of that delta.
 */
export declare function withoutWithheldNotice(text: string): string;
/**
 * The identity of one model call, minted here before the request leaves and carried through to the
 * record that call produces. It is an object, not a value, so two calls in flight cannot be confused
 * whichever order they finish in (#1133).
 */
export interface ModelCallIdentity {
    responseId: string;
}
/**
 * Told about each task model call of the run (not Swarm housekeeping or compaction):
 * its exact input before it is made, the answer after. The run's trajectory is recorded from these.
 */
export interface ModelCallObserver {
    request(input: {
        history: unknown[];
        systemPrompt: string;
        tools: WireToolSpec[];
        call?: ModelCallIdentity;
    }): Promise<void>;
    completed(turn: ModelTurn, history: unknown[], call?: ModelCallIdentity): Promise<void>;
}
/** Header carrying the call's response id back to the adapter that proxies the request (#1133). */
export declare const MODEL_RESPONSE_ID_HEADER = "x-sciencediscovery-response-id";
/** Run control is independent of optional, best-effort trajectory logging. */
export interface ModelGatewayLifecycle {
    progress(): void;
    /** Original provider usage, before Swarm can replace unreported fields with zero. Task calls only. */
    onUsage?(usage: ModelUsage | undefined): void;
    /** Synchronous admission, before sending a task model request upstream. */
    beforeTurn?(): void;
    /**
     * Whether every task request comes from a Swarm instance with the output-recovery boundary
     * (default true). JiuwenSwarm's own sub-agents share this gateway without it and would take a
     * withheld response for a final answer, so with them unparseable arguments fail the request.
     */
    recoversWithheldCalls?: boolean;
    /**
     * The tools whose call must carry every one of these arguments, by tool name.
     *
     * A call that leaves one out can never run, so it is withheld whole and the
     * model is asked to re-issue it, instead of the run showing a failed tool
     * card for a call that was never executable.
     */
    requiredArguments?: Readonly<Record<string, readonly string[]>>;
}
export declare function isSwarmCompaction(body: ChatRequest): boolean;
export declare function startModelGateway(endpoint: ModelEndpoint, policy: ModelClientPolicy, signal: AbortSignal, streamer?: Streamer, observer?: ModelCallObserver, lifecycle?: ModelGatewayLifecycle): Promise<ModelGateway>;
export {};
