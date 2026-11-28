import { type TSchema } from "typebox";
import { type ConfigurationCapabilityId } from "@sciencediscovery/schema";
export interface ConfigurationAgentDescriptor {
    label: string;
    whenNeeded: string;
    fields: Record<string, {
        kind: "string" | "boolean" | "ids" | "integer";
        maxLength?: number;
        minimum?: number;
        maximum?: number;
        choices?: readonly string[];
    }>;
    activation: "next_run" | "next_invocation" | "next_connection" | "requires_restart" | "same_run_if_bound" | "next_request";
    diagnostics: readonly string[];
}
/** Trusted finite descriptions. Each domain adds its fields here once; tools are generated from them. */
export declare const CONFIGURATION_AGENT_DESCRIPTORS: Record<ConfigurationCapabilityId, ConfigurationAgentDescriptor>;
export declare const SYSTEM_CONFIGURATION_CAPABILITIES: readonly ["timeouts.configure", "quotas.configure", "idea_tree.configure", "environment.sources"];
export declare const DEPLOYMENT_CONFIGURATION_CAPABILITIES: readonly ["timeouts.configure", "quotas.configure", "idea_tree.configure", "environment.sources", "memory.enable", "proxy.resources", "proxy.provider", "proxy.mcp", "web.configure", "web.credential", "reviewer.enable"];
export declare function descriptorValuesSchema(descriptor: ConfigurationAgentDescriptor): TSchema;
