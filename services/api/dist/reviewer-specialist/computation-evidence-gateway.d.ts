import type { CasStore } from "@sciencediscovery/cas";
import type { ComputationSourceProbe, QuantitativeArtifactClaim } from "@sciencediscovery/provenance";
import type { SessionStore } from "../store.js";
/**
 * Read-only bridge from a report's declared Artifact chip to the immutable
 * generated data and ExecutionRun that produced it. It deliberately refuses
 * unpinned versions, failed executions, mutable workspace files, and any
 * attempt to execute or re-run code.
 */
export declare class ReviewerComputationEvidenceGateway {
    private readonly store;
    private readonly cas;
    constructor(store: Pick<SessionStore, "getArtifact" | "getArtifactVersion" | "listArtifactVersions" | "listExecutionRuns">, cas: Pick<CasStore, "read" | "verify">);
    resolve(sessionId: string, claim: QuantitativeArtifactClaim): Promise<ComputationSourceProbe>;
    private resolveVersion;
    private readLocked;
}
