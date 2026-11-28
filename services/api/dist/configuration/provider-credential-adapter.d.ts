import type { SessionStore } from "../store.js";
import type { ConfigurationCredentialBridge } from "./credential-bridge.js";
import type { ModelDestinationAuthorizer } from "./model-destination.js";
import type { ConfigurationAdapter } from "./types.js";
export declare function createProviderCredentialAdapter(store: SessionStore, credentials: ConfigurationCredentialBridge, authorizer: ModelDestinationAuthorizer): ConfigurationAdapter;
