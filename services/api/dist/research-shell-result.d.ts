import type { AgentShellExecutionResult } from "@sciencediscovery/schema";
/** Runner publication receipts are installation-local; output evidence is portable. */
export declare function portableShellResult(result: AgentShellExecutionResult): Omit<AgentShellExecutionResult, "workspaceSnapshot" | "workspaceVersion">;
