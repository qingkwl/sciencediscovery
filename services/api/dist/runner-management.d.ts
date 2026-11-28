import type { RemoteComputeClient, RunnerClient } from "@sciencediscovery/executor";
import { type RunnerTarget } from "@sciencediscovery/schema";
import type { SessionStore } from "./store.js";
/**
 * The built-in endpoint and registered endpoints share one observable catalog.
 *
 * `reachability: "now"` is for the reads that paint a page: it answers with the
 * last known state (or `checking`) and refreshes behind the answer, so one
 * unreachable machine cannot hold the whole catalog for a connect timeout.
 */
export declare function runnerTarget(store: SessionStore, local: RunnerClient, remote: RemoteComputeClient, id: string, options?: {
    reachability?: "await" | "now";
}): Promise<RunnerTarget>;
/** Remote catalogs stay on their Runner: IDs may overlap the local catalog. */
export declare function manageRunnerEnvironment(runner: RunnerClient, store: SessionStore, path: string, method: string, body: unknown): Promise<unknown>;
/** Catalog known Session workspaces, including historical references after deselection. */
export declare function runnerWorkspaceBindings(store: SessionStore, hostId: string): Promise<{
    sessionId: string;
    sessionTitle: string;
    projectName: string;
    workspaceKey: string;
    runnerId: string;
    location: string;
    projectId: string;
    records: import("@sciencediscovery/schema").RemoteWorkspaceSyncRecord[];
}[]>;
