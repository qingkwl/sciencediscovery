import type { SessionStore } from "../store.js";
import type { ConfigurationAdapter } from "./types.js";
import { ConfigurationCredentialBridge } from "./credential-bridge.js";
import { type ModelDestinationAuthorizer } from "./model-destination.js";
type Options = {
    store: SessionStore;
    credentials: ConfigurationCredentialBridge;
    destinations: ModelDestinationAuthorizer;
    connector: (sessionId: string, connectorId: string) => {
        name: string;
        ready: boolean;
    } | undefined;
};
/** Register finite domain adapters around the existing authoritative stores. */
export declare function createConfigurationDomainAdapters(options: Options): ConfigurationAdapter[];
export {};
