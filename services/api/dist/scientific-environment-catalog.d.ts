import type { ProvenanceRecorder } from "@sciencediscovery/provenance";
import type { RunnerClient } from "@sciencediscovery/executor";
import type { SessionStore } from "./store.js";
/** Mirror the runner's immutable environment catalog and verified snapshots into the API store. */
export declare function syncScientificEnvironmentCatalog(store: SessionStore, runnerClient: RunnerClient, provenanceRecorder: ProvenanceRecorder): Promise<void>;
