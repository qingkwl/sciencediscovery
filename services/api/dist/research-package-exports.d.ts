import type { Writable } from "node:stream";
export type ResearchPackageExportOptions = {
    projectId: string;
    sessionId?: string;
    level: "necessary" | "complete";
    selectedFiles?: string[];
    includeFullTrajectory: boolean;
    includeFullMemoryGraph: boolean;
    revision: string;
    /**
     * The revision the HTTP route just observed while sizing the request. Reusing
     * it removes a duplicate whole-tree walk before packaging (#1365); the
     * post-write check still re-reads the tree and refuses a stale archive.
     */
    observedRevision?: string;
    /** The user confirmed the over-cap warning; the task may then use the safe ceiling. */
    allowOverCap?: boolean;
};
export type ResearchPackageExportStatus = {
    id: string;
    status: "queued" | "running" | "completed" | "failed" | "canceled";
    filename: string;
    createdAt: string;
    updatedAt: string;
    error?: string;
};
/** Runs heavyweight package creation independently of the browser request. */
export declare class ResearchPackageExports {
    private readonly root;
    private readonly currentRevision;
    private readonly createPackage;
    private readonly now;
    private readonly tasks;
    private queue;
    private ready?;
    constructor(root: string, currentRevision: (projectId: string, sessionId?: string) => Promise<string>, createPackage: (options: ResearchPackageExportOptions, destination: Writable) => Promise<void>, now?: () => number);
    private timestamp;
    private isExpired;
    private removeTaskFiles;
    private pruneExpiredTasks;
    private initialize;
    private persist;
    start(options: ResearchPackageExportOptions, filename: string): Promise<ResearchPackageExportStatus>;
    private run;
    /** Cancel a queued/running export; a terminal task is returned unchanged. */
    cancel(id: string, projectId: string): Promise<ResearchPackageExportStatus | undefined>;
    get(id: string, projectId: string): Promise<ResearchPackageExportStatus | undefined>;
    download(id: string, projectId: string): Promise<{
        path: string;
        filename: string;
    } | undefined>;
    close(): Promise<void>;
    private publicTask;
}
