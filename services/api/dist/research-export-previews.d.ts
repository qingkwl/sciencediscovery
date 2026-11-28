import type { ResearchPackageExportProfile } from "@sciencediscovery/research-package";
export type ExportPreviewOptions = {
    projectId: string;
    sessionId?: string;
    level: "necessary" | "complete";
    selectedFiles?: Set<string>;
    includeFullTrajectory: boolean;
    includeFullMemoryGraph?: boolean;
};
export type ResearchExportPreview = {
    revision: string;
    estimatedBytes: number;
    estimateKind: "uncompressed";
    files: Array<{
        path: string;
        size: number;
        selected?: boolean;
    }>;
    omissions: string[];
    exportProfile?: ResearchPackageExportProfile;
    /** The one package cap (#1152). Additive: older clients keep their own default. */
    maxBytes?: number;
    /** The exact uncompressed tar size this selection would produce, which is what a refusal is based on. */
    archiveBytes?: number;
};
export type DefaultExportPreviews = {
    revision: string;
    necessary: ResearchExportPreview;
    complete: ResearchExportPreview;
    completeWithTrajectory: ResearchExportPreview;
    completeWithMemoryGraph: ResearchExportPreview;
    completeWithTrajectoryAndMemoryGraph: ResearchExportPreview;
};
type WarmMemo = {
    revision?: string;
    allowed?: boolean;
    pendingRevision?: string;
    pending?: Promise<boolean>;
};
/**
 * One revision walk per preview request.
 *
 * A preview used to read the whole session tree three times per profile: once at
 * admission, once when the queued work started, and once after the build to prove
 * the evidence had not moved (#1365). The five default profiles multiplied that to
 * fifteen walks per dialog. The first read is now the request's snapshot, shared by
 * every profile; the build reports when its own workspace reconcile wrote evidence,
 * and only then does the request take a second walk and retry under the new revision.
 * A preview that writes nothing therefore costs exactly one walk.
 */
declare class PreviewRevisionScope {
    private readonly read;
    private initialRead?;
    private latestRead?;
    constructor(read: (projectId: string, sessionId?: string) => Promise<string>);
    initial(projectId: string, sessionId?: string): Promise<string>;
    latest(projectId: string, sessionId?: string): Promise<string>;
    /** A profile observed a newer revision; later profiles start from it. */
    adopt(revision: string): void;
    /** A sibling deletion invalidated the snapshot; the retry must read it again. */
    invalidate(): void;
}
/** Scope key the package builder sets when its reconcile actually wrote evidence. */
export declare const PREVIEW_EVIDENCE_MUTATED = "previewEvidenceMutated";
/** Bounded metadata cache and serial work queue; never retain an export payload. */
export declare class ResearchExportPreviews {
    private readonly revision;
    /**
   * @param scope Opaque per-request state, created by `defaults()` for its five
   *   profiles. It exists so work that is only valid within one dialog request — the
   *   complete workspace listing — is shared across those five calls and cannot leak
   *   into the next request, where the workspace may have changed.
   */
    private readonly calculate;
    private readonly canWarm;
    private readonly now;
    private readonly entries;
    private readonly completed;
    private readonly watching;
    private readonly controllers;
    /**
     * One serial chain *per session*, not one for the whole service.
     *
     * The five profiles a dialog asks for share a session's evidence and must stay
     * ordered against each other — the intra-session hazard below (awaiting a
     * queue entry admitted later would deadlock) is unchanged, because within one
     * session the ordering is exactly what it was. What changes is that session A's
     * dialog no longer serialises behind session B's, and an aborted dialog cannot
     * make the next session wait behind work nobody wants (#1140 §7.5).
     */
    private readonly queues;
    private closed;
    private ticking;
    constructor(revision: (projectId: string, sessionId?: string) => Promise<string>, 
    /**
   * @param scope Opaque per-request state, created by `defaults()` for its five
   *   profiles. It exists so work that is only valid within one dialog request — the
   *   complete workspace listing — is shared across those five calls and cannot leak
   *   into the next request, where the workspace may have changed.
   */
    calculate: (options: ExportPreviewOptions, revision: string, signal: AbortSignal, scope?: Map<string, unknown>) => Promise<ResearchExportPreview>, canWarm?: (projectId: string, sessionId: string) => Promise<boolean>, now?: () => number);
    private key;
    private remember;
    watch(projectId: string, sessionId: string, warmNow?: boolean): void;
    private warm;
    private assertCanCalculate;
    get(options: ExportPreviewOptions, deferWhileRunning?: boolean, memo?: WarmMemo, scope?: Map<string, unknown>, request?: PreviewRevisionScope): Promise<ResearchExportPreview>;
    private getAttempt;
    defaults(projectId: string, sessionId: string, deferWhileRunning?: boolean, memo?: WarmMemo): Promise<DefaultExportPreviews>;
    tick(): Promise<void>;
    cancel(projectId: string, sessionId?: string): void;
    close(): Promise<void>;
}
export {};
