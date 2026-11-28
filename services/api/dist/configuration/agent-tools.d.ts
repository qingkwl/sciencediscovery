import { Type } from "typebox";
import type { AgentTool } from "@sciencediscovery/tools";
import type { ConfigurationActivationEvidence } from "./runtime-bridge.js";
import type { ConfigurationApplyReceipt, ConfigurationRecord } from "./types.js";
import type { SessionStore } from "../store.js";
/** Stable transport only; capability IDs and field schemas stay in server-side discovery. */
export declare const CONFIGURATION_TOOL_PARAMETERS: Type.TObject<{
    action: Type.TUnion<[Type.TLiteral<"search">, Type.TLiteral<"describe">, Type.TLiteral<"propose">]>;
    query: Type.TOptional<Type.TString>;
    capabilityId: Type.TOptional<Type.TString>;
    targetId: Type.TOptional<Type.TString>;
    cursor: Type.TOptional<Type.TString>;
    limit: Type.TOptional<Type.TInteger>;
    diagnosticCode: Type.TOptional<Type.TString>;
    values: Type.TOptional<Type.TObject<{}>>;
    reason: Type.TOptional<Type.TString>;
    scope: Type.TOptional<Type.TUnion<[Type.TLiteral<"session">, Type.TLiteral<"project">]>>;
}>;
/** Main Agent only. User decisions and credentials remain separate channels. */
export declare function createConfigurationAgentTools(input: {
    store: SessionStore;
    sessionId: string;
    runId: string;
    beginExternalWait?: () => () => void;
    onWaitReady?: () => Promise<void>;
    activateConnector?: (record: ConfigurationRecord, receipt: ConfigurationApplyReceipt) => Promise<ConfigurationActivationEvidence>;
}): AgentTool[];
