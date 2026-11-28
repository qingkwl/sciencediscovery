import type { SessionStore } from "../store.js";
import type { ConfigurationAdapter } from "./types.js";
/** Rename existing metadata only. Never read, collect or change a proxy URL or route. */
export declare function createProxyResourceAdapter(store: SessionStore): ConfigurationAdapter;
