import type { RuntimeSettingsOverrides } from "@sciencediscovery/schema";
export declare const CONFIGURATION_CONNECTOR_DISCOVERY_INSTRUCTIONS = "When a task needs configuration or an installed resource seems missing, use configuration(search), then describe if needed and propose a user choice. Query actual readiness and activation timing; never guess IDs, repeat declined changes, collect keys in chat or treat network errors as permission to weaken settings.";
/** Registered server facts only; never accept these from Agent tool arguments. */
export interface ConfigurationConnectorRegistration {
    id: string;
    name: string;
    ready: boolean;
    readiness: string;
    readinessReason?: "MCP_CONNECTION_TIMEOUT" | "MCP_AUTHENTICATION_REQUIRED" | "MCP_SERVER_DISABLED" | "MCP_TOOLS_MISSING" | "MCP_UNAVAILABLE";
    sameRunSupported: boolean;
}
export declare function configurationConnectorReadinessReason(status: {
    status: string;
    error?: string;
}): ConfigurationConnectorRegistration["readinessReason"];
export interface ConfigurationConnectorResource extends ConfigurationConnectorRegistration {
    installed: true;
    runtimeEnabled: boolean;
    runtimeStateKnown: boolean;
    sessionEnabled: boolean;
    runtimePolicyAllowed: boolean;
    sessionPolicyAllowed: boolean;
    policyAllowed: boolean;
    canPropose: boolean;
    activationMode: "same_run" | "next_run";
    unavailableReason?: string;
}
/** One directory drives generic inspection and legacy proposal descriptions. */
export declare function configurationConnectorDirectory(input: {
    registrations: readonly ConfigurationConnectorRegistration[];
    runtimeEnabledConnectorIds?: readonly string[];
    sessionEnabledConnectorIds: readonly string[];
    runtimePlugins?: RuntimeSettingsOverrides["plugins"];
    sessionPlugins?: RuntimeSettingsOverrides["plugins"];
    nativeExecutor: boolean;
    runBound: boolean;
}): ConfigurationConnectorResource[];
