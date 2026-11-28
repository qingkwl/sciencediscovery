import { type McpSourceRegistry } from "@sciencediscovery/mcp-sources";
import type { McpSourceCatalog } from "@sciencediscovery/data-source";
import type { WorkspaceAgentOptions } from "@sciencediscovery/workspace";
import type { SessionStore } from "../store.js";
import type { ConfigurationApplyReceipt, ConfigurationRecord } from "./types.js";
import type { ConfigurationActivationEvidence } from "./runtime-bridge.js";
type ToolDescriptor = Omit<NonNullable<WorkspaceAgentOptions["mcpTools"]>[number], "execute">;
export declare function nativeToolFingerprint(tools: readonly ToolDescriptor[]): string;
/** Assemble the actual workspace tool descriptors from the frozen run + approved delta, without invoking them. */
export declare function prepareNativeConnectorActivation(input: {
    store: SessionStore;
    record: ConfigurationRecord;
    receipt: ConfigurationApplyReceipt;
    registry: McpSourceRegistry;
    catalog: McpSourceCatalog;
}): Promise<ConfigurationActivationEvidence>;
/** Called after real executable tools are rebuilt, before the resumed model can run. Legacy requests have no V2 witness. */
export declare function verifyNativeConfigurationToolAssembly(input: {
    store: SessionStore;
    sessionId: string;
    runId: string;
    requestId: string;
    enabledConnectorIds: readonly string[];
    tools: NonNullable<WorkspaceAgentOptions["mcpTools"]>;
    webSearchAvailable?: boolean;
}): void;
export {};
