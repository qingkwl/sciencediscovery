import type { RequestExecutionIdentity } from "@sciencediscovery/orchestration";
import type { RunStreamEvent } from "@sciencediscovery/schema";
import type { AgentPermissionRuntime } from "@sciencediscovery/governance";
export interface OuterResponseSink {
    emit(event: RunStreamEvent): void;
}
export interface RequestExecutionContext {
    abortSignal: AbortSignal;
    identity: RequestExecutionIdentity;
    permission: AgentPermissionRuntime;
    responseSink: OuterResponseSink;
}
export declare function createRequestExecutionContext(context: RequestExecutionContext): RequestExecutionContext;
