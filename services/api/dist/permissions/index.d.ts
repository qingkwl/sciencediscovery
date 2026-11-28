import { RemoteComputeClient } from "@sciencediscovery/executor";
import type { PermissionRequest, RemoteJob, RunStreamEvent } from "@sciencediscovery/schema";
import { GovernedDownloadManager } from "@sciencediscovery/artifact-manager";
import { ProvenanceRecorder } from "@sciencediscovery/provenance";
import { SessionStore } from "../store.js";
type RunEventSink = (event: RunStreamEvent) => void | Promise<void>;
export { PermissionDecisionQueue } from "@sciencediscovery/governance";
export declare function waitForPermissionDecision(store: SessionStore, request: PermissionRequest, timeoutMs: number, signal?: AbortSignal, runWait?: {
    emit: RunEventSink;
    runId: string;
    sessionId: string;
}): Promise<PermissionRequest>;
export declare function startApprovedRemoteJob(job: RemoteJob, store: SessionStore, remoteCompute: RemoteComputeClient, provenanceRecorder: ProvenanceRecorder): Promise<RemoteJob>;
export declare function advanceResolvedPermissionRequests(requests: PermissionRequest[], store: SessionStore, artifactManager: GovernedDownloadManager, remoteCompute: RemoteComputeClient, provenanceRecorder: ProvenanceRecorder): Promise<{
    artifactApprovals: Awaited<ReturnType<GovernedDownloadManager["approveByPermissionRequest"]>>;
    remoteJobs: RemoteJob[];
}>;
