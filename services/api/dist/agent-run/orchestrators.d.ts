import type { AgentHistoryMessage, AgentRunPurpose, AgentRunResult, MainAgentProfile, SubagentProfile } from "@sciencediscovery/orchestration";
import { type AgentRunBindings, type AgentRunHandle } from "./create-agent-run.js";
export interface RequestExecutionRunInput {
    history: AgentHistoryMessage[];
    prompt: string;
    purpose: AgentRunPurpose;
}
export interface MainRequestExecutionScope {
    beginExternalWait(): () => void;
    executeAgentRun(input: RequestExecutionRunInput): Promise<AgentRunResult>;
}
export declare function runMainRequestExecution(options: {
    bindings: AgentRunBindings;
    profile: MainAgentProfile;
    requestExecutionId: string;
}): MainRequestExecutionScope;
export declare function runSubagentTask(options: {
    bindings: AgentRunBindings;
    history?: AgentHistoryMessage[];
    profile: SubagentProfile;
    prompt: string;
    requestExecutionId: string;
    runContract?: string;
}): AgentRunHandle;
