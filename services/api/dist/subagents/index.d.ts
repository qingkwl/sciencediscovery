import type { Subagent, SubagentBrief, SubagentInput, WorkspaceFile } from "@sciencediscovery/schema";
import { SessionStore } from "../store.js";
/** Session-workspace prefix holding each subagent's private handoff scratch space. */
export declare const SUBAGENT_PRIVATE_WORKSPACE_PREFIX = "subagents/";
/** Files below the prefix are subagent-internal bookkeeping, not user workspace content. */
export declare function isSubagentPrivateWorkspacePath(path: string): boolean;
export declare function subagentInputReferenceText(input: SubagentInput | undefined): string;
export declare function escapeRegExp(value: string): string;
export declare function mentionsWorkspacePath(text: string, path: string): boolean;
export declare function normalizeSubagentInputPath(path: string): string;
export declare function selectSubagentHandoffInputs(parentInputFiles: WorkspaceFile[], input: SubagentInput | undefined): {
    files: WorkspaceFile[];
    skippedInputPaths: NonNullable<NonNullable<Subagent["handoff"]>["skippedInputPaths"]>;
};
export declare function prepareSubagentHandoff(store: SessionStore, sessionId: string, subagentId: string, input?: SubagentInput): Promise<NonNullable<Subagent["handoff"]>>;
export declare function numberedLines(items: string[]): string;
export declare function formatSubagentExecutionPrompt(input: SubagentInput, handoff: NonNullable<Subagent["handoff"]>): string;
export declare function parseFinalJsonObject(text: string): unknown;
export declare function validateSubagentStructuredResult(brief: SubagentBrief | undefined, assistantOutput: string): Partial<Pick<Subagent, "rawStructuredResult" | "resultValidation" | "structuredResult">>;
