import { type AgentLoop, type AgentLoopOptions, type ContextAssembler, type ExternalWaitController, type ModelClient, type RunEventSink, type RuntimeMessage, type ToolDispatcher, type TurnLifecycle } from "@sciencediscovery/runtime-core";
export interface RuntimeComposition<TMessage extends RuntimeMessage, TModelInput, TUsage> {
    contextAssembler: ContextAssembler<TMessage, TModelInput>;
    eventSink: RunEventSink<TUsage>;
    maxModelTurns: number;
    maxParallelToolCalls: number;
    modelClient: ModelClient<TMessage, TModelInput, TUsage>;
    toolDispatcher: ToolDispatcher<TMessage>;
    waitController: ExternalWaitController;
    turnLifecycle?: TurnLifecycle<TMessage, TModelInput, TUsage>;
    outputRecovery?: AgentLoopOptions<TMessage, TModelInput, TUsage>["outputRecovery"];
    suspendAfterTurn?: AgentLoopOptions<TMessage, TModelInput, TUsage>["suspendAfterTurn"];
    accumulateUsage?: AgentLoopOptions<TMessage, TModelInput, TUsage>["accumulateUsage"];
}
/** API composition root: adapters are registered here, not looked up by the core. */
export declare function composeRuntime<TMessage extends RuntimeMessage, TModelInput, TUsage>(composition: RuntimeComposition<TMessage, TModelInput, TUsage>): AgentLoop<TMessage, TModelInput, TUsage>;
