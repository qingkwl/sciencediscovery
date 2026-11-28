import { type WebKeyProvider } from "@sciencediscovery/schema";
import type { SessionStore } from "../store.js";
import type { ConfigurationCredentialBridge } from "./credential-bridge.js";
import type { ConfigurationAdapter } from "./types.js";
/** The same finite provider sets as the Web settings page. */
export declare const webCredentialProviders: (native: boolean) => readonly WebKeyProvider[];
export declare function createWebCredentialAdapter(store: SessionStore, credentials: ConfigurationCredentialBridge, native: () => boolean): ConfigurationAdapter;
