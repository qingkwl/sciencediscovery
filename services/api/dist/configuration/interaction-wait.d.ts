import type { SessionStore } from "../store.js";
import type { ConfigurationRecord } from "./types.js";
export declare const CONFIGURATION_PENDING_STATES: Set<string>;
/** All capabilities share this interaction lifecycle; activation timing is independent. */
export declare function configurationDecisionReady(record: ConfigurationRecord): boolean;
/** Compatibility projection, not a second request store or connector-specific wait. */
export declare function listConfigurationInteractions(store: SessionStore, sessionId: string): (import("@sciencediscovery/schema").ConnectorConfigurationRequest | {
    id: string;
    runId: string;
    state: import("@sciencediscovery/schema").ConfigurationRequestState;
    connectorId: string;
    connectorName: import("@sciencediscovery/schema").ConfigurationCapabilityId;
    stopGeneration: number;
})[];
export declare function getConfigurationInteraction(store: SessionStore, sessionId: string, requestId: string): import("@sciencediscovery/schema").ConnectorConfigurationRequest | {
    id: string;
    runId: string;
    state: import("@sciencediscovery/schema").ConfigurationRequestState;
    connectorId: string;
    connectorName: import("@sciencediscovery/schema").ConfigurationCapabilityId;
    stopGeneration: number;
} | undefined;
