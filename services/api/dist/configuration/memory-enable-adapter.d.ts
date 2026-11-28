import type { SessionStore } from "../store.js";
import type { ConfigurationAdapter } from "./types.js";
/** The workbench MemoryGraph gate, not an Agent's independent memory or a backend connection test. */
export declare function createMemoryEnableAdapter(store: SessionStore): ConfigurationAdapter;
