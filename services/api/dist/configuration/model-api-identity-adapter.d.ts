import type { SessionStore } from "../store.js";
import type { ConfigurationAdapter } from "./types.js";
import { type ModelDestinationAuthorizer } from "./model-destination.js";
export declare function createModelApiIdentityAdapter(store: SessionStore, destinations: ModelDestinationAuthorizer): ConfigurationAdapter;
