import type { CitationSourceMaterial, LiteratureCitationCandidate } from "@sciencediscovery/provenance";
import type { SessionStore } from "../store.js";
/**
 * Read-only bridge from a Paper Reader acquisition to Reviewer source facts.
 * It never opens the mutable workspace: every excerpt is read back through the
 * recorded data-CAS hash of the same Session's extracted file.
 */
export declare class ReviewerPaperEvidenceGateway {
    private readonly store;
    private readonly dataCas;
    constructor(store: Pick<SessionStore, "dataDir" | "getWorkspaceFileProvenance" | "listPaperAcquisitions">);
    resolveCitation(sessionId: string, candidate: LiteratureCitationCandidate): Promise<CitationSourceMaterial[]>;
    private readRecordedFile;
}
