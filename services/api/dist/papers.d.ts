import type { ArtifactCandidate, ArtifactExtractionJob, PaperAcquisition, PaperVisionRun } from "@sciencediscovery/schema";
import { SessionStore } from "./store.js";
export declare const MAX_PAPER_PDF_BYTES: number;
export declare class PaperService {
    private readonly store;
    private readonly pythonPath;
    private readonly workerPath;
    private readonly fetchImpl?;
    /** [D3 P2-2] frozen rail: prefer `<exe> paper …` when provided. */
    private readonly frozenCommand?;
    private readonly cas;
    private readonly dataCas;
    constructor(store: SessionStore, pythonPath: string, workerPath: string, fetchImpl?: typeof fetch | undefined, 
    /** [D3 P2-2] frozen rail: prefer `<exe> paper …` when provided. */
    frozenCommand?: {
        exe: string;
        args: string[];
    } | undefined);
    upload(input: {
        bytes: Buffer;
        sessionId: string;
        title?: string;
    }): Promise<PaperAcquisition>;
    importArtifact(input: {
        candidate: ArtifactCandidate;
        outputPathPrefix?: string;
        path: string;
        sessionId: string;
        signal?: AbortSignal;
    }): Promise<PaperAcquisition>;
    /**
     * Extract a PDF already in the Session Workspace, such as one the user uploaded. The same bytes
     * extracted before in this Session return the earlier acquisition instead of a second copy.
     */
    extractWorkspacePdf(input: {
        outputPathPrefix?: string;
        path: string;
        sessionId: string;
        signal?: AbortSignal;
    }): Promise<PaperAcquisition>;
    extractArtifact(input: {
        artifactJobId: string;
        candidate: ArtifactCandidate;
        outputPathPrefix?: string;
        path: string;
        sessionId: string;
        signal?: AbortSignal;
    }): Promise<{
        acquisition: PaperAcquisition;
        job: ArtifactExtractionJob;
    }>;
    analyzeVision(input: {
        modelId: string;
        paperId: string;
        prompt?: string;
        sessionId: string;
    }): Promise<PaperVisionRun>;
    private storePaper;
}
