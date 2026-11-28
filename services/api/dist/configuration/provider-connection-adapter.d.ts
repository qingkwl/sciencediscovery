import type { SessionStore } from "../store.js";
import type { ConfigurationAdapter } from "./types.js";
import { type ModelDestinationAuthorizer } from "./model-destination.js";
type Connection = ReturnType<SessionStore["configurationProviderConnectionCandidate"]>;
type Source = ReturnType<SessionStore["configurationProviderConnectionSource"]>;
/** Derive the same wire paths as the normal model and discovery clients, without sending a request. */
export declare function providerConnectionDestination(providerId: string, candidate: Connection, source: Source, versions: Record<string, string>): {
    endpointTarget: string;
    destinations: {
        url: string;
        label: string;
    }[];
    host: string;
    classification: "loopback" | "private_network" | "public_http" | "public_https";
};
export declare function createProviderConnectionAdapter(store: SessionStore, authorizer: ModelDestinationAuthorizer): ConfigurationAdapter;
export {};
