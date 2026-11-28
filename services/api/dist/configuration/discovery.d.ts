import type { SessionStore } from "../store.js";
type Row = Record<string, unknown>;
export interface ConfigurationDiscoveryInput {
    query?: string;
    capabilityId?: string;
    targetId?: string;
    cursor?: string;
    limit?: number;
    diagnosticCode?: string;
}
/** Build a valid UTF-8 JSON page. Identifiers and schema are never string-truncated. */
export declare function configurationPage(base: Row, rows: readonly Row[], input: ConfigurationDiscoveryInput, identity: unknown, maxBytes: number): Row;
/** Server-side catalog. Only a scoped page is projected to the model. No network, probes or mutations. */
export declare function discoverConfiguration(store: SessionStore, sessionId: string, runId: string, action: "search" | "describe", input: ConfigurationDiscoveryInput): Promise<Row>;
export {};
