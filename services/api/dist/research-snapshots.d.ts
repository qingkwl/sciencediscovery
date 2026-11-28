import { type ObjectRef } from "@sciencediscovery/cas";
import { type ExportInput, type ImportedResearchPackage, type ResearchPackageCounts, type ResearchPackageExportProfile } from "@sciencediscovery/research-package";
import type { MemoryGraphSnapshot } from "@sciencediscovery/memory";
import type { ArtifactAnnotation, ArtifactReviewRun, ChatMessage, ReviewRun, ReviewerAuditTask, ReviewFeedback, ScientificArtifact, ScientificArtifactVersion, Session, SessionRun, SessionRunEvent, WorkspaceFileProvenance } from "@sciencediscovery/schema";
import { listWorkspaceFiles } from "./artifacts/index.js";
/** What a complete workspace listing returns, derived rather than re-imported. */
type WorkspaceListing = Awaited<ReturnType<typeof listWorkspaceFiles>>;
import type { createPlatformServices } from "./bootstrap/platform.js";
import { ResearchExportPreviews } from "./research-export-previews.js";
import { ResearchPackageExports } from "./research-package-exports.js";
import { type PackageTrajectory } from "./research-package-trajectory.js";
import { type PackageHistory } from "./research-package-history.js";
type Ports = Pick<ReturnType<typeof createPlatformServices>, "store" | "memoryGraphClient" | "memoryGraphEnabled" | "provenanceRecorder" | "evolutionStore" | "evolveCandidates">;
type PreviewSizing = {
    objectSizes: Map<string, number>;
    additionalRecordBytes: number;
    /**
     * Sizes of objects the writer will add but whose address the preview cannot know
     * without reading the payload — a workspace file the exporter copies and hashes
     * while it writes. They are counted as objects, not as record bytes, so the
     * estimate keeps matching the archive the same selection produces (#1216 review 4).
     */
    unpinnedObjectBytes: number[];
    hashes: Set<string>;
    refs: Map<string, ObjectRef>;
    jsonSizes: WeakMap<object, number>;
    casVisited: WeakSet<object>;
    refsVisited: WeakSet<object>;
    /**
     * Per-session trail of what the trajectory walk produced, so the two profiles
     * that both ask for `includeFullTrajectory` walk the closure once instead of
     * twice (#1140 §7.4).
     *
     * Only the measured quantities are kept — one byte count, the CAS hashes and
     * the version refs per entry — never the details themselves, because #1085 was
     * lost to keeping entries alive.
     */
    trajectorySizing?: Map<string, TrajectorySizingEntry[]>;
    /**
     * The complete workspace listing of each session, shared by the profiles of one
     * dialog request for as long as it is young (#1140 §7.8).
     *
     * Each profile used to scan the directory and reconcile the catalog on its own —
     * five writes to produce one read-only estimate — plus a second scan of the same
     * session to build its file list. Sharing is bounded in time rather than scoped to
     * the request, like the bounded UI listing already is, so a file written after the
     * first profile is still seen by a later request instead of being hidden until the
     * evidence revision moves.
     */
    workspaceListings?: PreviewWorkspaceListings;
    /** Set when this preview's workspace reconcile actually wrote provenance. */
    workspaceMutated?: boolean;
};
/**
 * The complete listing of one session, cached for the lifetime of a single dialog
 * request.
 *
 * It is deliberately not time-bounded. The five profiles are serialised on the
 * per-session queue, so on a large workspace the last one starts more than a second
 * after the first; an age bound would re-scan there and hand the last profiles a
 * different workspace than the ones before them. Request scope is the right bound:
 * a new request asks again, and the workspace only has to be consistent within the
 * one answer the user is waiting for.
 */
type PreviewWorkspaceListings = Map<string, Promise<WorkspaceListing>>;
type TrajectorySizingEntry = {
    unreadable: string;
} | {
    bytes: number;
    hashes: string[];
    id: string;
    refs: Array<[string, ObjectRef]>;
};
export type ExportSessionRecord = PackageHistory & {
    session: Omit<Session, "settingsOverrides"> & {
        settingsOverrides?: undefined;
    };
    messages: ChatMessage[];
    runs: SessionRun[];
    artifactAnnotations: ArtifactAnnotation[];
    runEvents?: Array<{
        runId: string;
        streams: Array<{
            streamId: string;
            events: SessionRunEvent[];
        }>;
    }>;
    /** Run-stream event count for profiles that do not materialise `runEvents`. */
    runEventCount?: number;
    trajectory: PackageTrajectory;
    workspace: Array<{
        path: string;
        objectPath: string;
        size?: number;
        modifiedAt?: string;
    }>;
    workspaceProvenance: WorkspaceFileProvenance[];
    validations: {
        artifactReviews: ArtifactReviewRun[];
        reviews: ReviewRun[];
        reviewerAuditTasks: ReviewerAuditTask[];
        reviewFeedback: ReviewFeedback[];
    };
};
export type ExportArtifact = ScientificArtifact & {
    currentVersion: number;
    versions: Array<ScientificArtifactVersion & {
        objectPath?: string;
    }>;
};
export declare function countExport(sessions: ExportSessionRecord[], artifacts: ExportArtifact[], graph?: MemoryGraphSnapshot): ResearchPackageCounts;
/**
 * True when the package proves its source session ran an evolution search.
 *
 * `evolveArtifactName` publishes a run's result as `evolve/<run>/<entrypoint>`,
 * so the presence of such an artifact is the only evidence the package carries;
 * the run records themselves are not in the format. Used to decide whether the
 * import receipt should report the missing searches, rather than reporting it
 * for every package (#1019 review F1).
 */
/** The run entries a package carries for one source session. A malformed
 *  package degrades to "nothing to restore" rather than to a failed import. */
export declare function packageEvolveRunsFor(payload: unknown, sourceSessionId: string | undefined): unknown[];
/** Whether the package actually carries evolve runs.
 *
 *  Counts the run list itself, not the runs that would restore for one source
 *  session: a package written by this exporter stamps every run with a string
 *  `sessionId`, so the owner-scoped filter in `packageEvolveRunsFor` would
 *  report "carries nothing" for the very package it just produced (#1019). */
export declare function packagedEvolveRuns(payload: unknown): boolean;
/** Whether any carried run has candidates whose source files do not travel.
 *
 *  A candidate's source lives outside the package (`evolve-candidates/<runId>/
 *  <sha256>.py`), so the exporter carries the run record and its event log but
 *  never the source scripts. A run with candidates therefore comes back with
 *  references that cannot be inspected or re-run, and the receipt must say so. */
export declare function packageCarriesEvolveCandidates(payload: unknown): boolean;
export declare function packageRanEvolve(artifacts: Array<{
    name?: unknown;
}> | undefined): boolean;
/**
 * What a restore receives: a parsed package, the file it arrived as, or its bytes.
 *
 * The file form is what a streamed upload produces (#1152 stage 2): the restore reads
 * the objects from the unpacked directory and copies the archive instead of buffering it.
 */
export type ImportedPackageSource = {
    imported?: ImportedResearchPackage;
    packageFile?: string;
    bytes?: Buffer;
};
export declare function createResearchSnapshots({ store, evolutionStore, evolveCandidates, memoryGraphClient, memoryGraphEnabled, provenanceRecorder }: Ports, sessionHasResearchHistory: (sessionId: string) => Promise<boolean>): {
    startContinuation: (sourceSessionId: string, requestId: string) => Promise<import("@sciencediscovery/schema").ResearchContinuationOperation>;
    startConversationBranch: (sourceSessionId: string, sourceMessageId: string, requestId: string) => Promise<import("@sciencediscovery/schema").ResearchContinuationOperation>;
    getContinuation: (sourceSessionId: string, id: string) => Promise<import("@sciencediscovery/schema").ResearchContinuationOperation>;
    recoverContinuations: () => Promise<void>;
    buildResearchPackageInput: (projectId: string, sessionId?: string, level?: "necessary" | "complete", selectedFiles?: Set<string>, cohort?: Set<string>, preview?: PreviewSizing, includeFullTrajectory?: boolean, includeFullMemoryGraph?: boolean, signal?: AbortSignal, options?: {
        streamObjects?: boolean;
    }) => Promise<ExportInput>;
    exportPreviews: ResearchExportPreviews;
    packageExports: ResearchPackageExports;
    previewResearchPackage: (projectId: string, sessionId: string | undefined, level: "necessary" | "complete", selectedFiles?: Set<string>, includeFullTrajectory?: boolean, includeFullMemoryGraph?: boolean) => Promise<import("./research-export-previews.js").ResearchExportPreview>;
    persistImportedResearchPackage: (projectId: string, sessionId: string | undefined, source: Buffer | ImportedPackageSource) => Promise<{
        packageChecksum: string;
        sourcePackageChecksum: string;
        importedObjectCount: number;
        importedRecordBytes: number;
        createdAt: string;
        exportProfile?: ResearchPackageExportProfile;
        artifactCount: number;
        continuationAvailable: boolean;
        sessionMapping: {
            [k: string]: string;
        };
        importedSessionIds: string[];
        omissions: string[];
        projectId: string;
        sessionId?: string | undefined;
        storagePath: string;
    }>;
};
export {};
