import type { ConfigurationCapabilityId, ConfigurationCapabilityView } from "@sciencediscovery/schema";
import type { ConfigurationAdapter } from "./types.js";
import { type ConfigurationAgentDescriptor } from "./agent-metadata.js";
export declare class ConfigurationRegistry {
    private readonly adapters;
    private readonly descriptors;
    register(adapter: ConfigurationAdapter, descriptor?: ConfigurationAgentDescriptor): this;
    get(id: string): ConfigurationAdapter;
    lookup(id: string): ConfigurationAdapter | undefined;
    list(): ConfigurationCapabilityView[];
    describe(): {
        id: ConfigurationCapabilityId;
        adapterVersion: number;
        schemaVersion: number;
        scopes: Array<import("@sciencediscovery/schema").ConfigurationScope["kind"]>;
        persistence: "local_transaction" | "external_control";
        autoApplyEligible: boolean;
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
    }[];
    fields(id: string): Record<string, {
        kind: "string" | "boolean" | "ids" | "integer";
        maxLength?: number;
        minimum?: number;
        maximum?: number;
        choices?: readonly string[];
    }>;
    agentValues(id: string, input: unknown): import("@sciencediscovery/schema").ConfigurationValues;
}
