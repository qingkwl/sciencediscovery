import type { AgentHistoryMessage } from "@sciencediscovery/orchestration";
/** Keep only protocol-closed assistant/tool segments. If a provider/runtime
 * ends with an assistant tool call that has no matching result, dropping that
 * assistant and everything dependent on it is safer than replaying a request
 * shape that OpenAI-compatible and Anthropic endpoints reject. */
export declare function closedModelContext(messages: readonly AgentHistoryMessage[]): AgentHistoryMessage[];
