import type { AgentHistoryMessage } from "@sciencediscovery/orchestration";
/** Model-history projection only. Raw tool events/CAS records are not edited. */
export declare function projectConfigurationHistory(history: readonly AgentHistoryMessage[]): AgentHistoryMessage[];
