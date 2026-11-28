import type { IncomingMessage } from "node:http";
import type { WorkspaceFile } from "@sciencediscovery/schema";
export type WorkspaceConflictPolicy = "reject" | "overwrite" | "rename";
/** Per-file multipart upload default: 1 GiB. 0 = unlimited. */
export declare const DEFAULT_WORKSPACE_UPLOAD_MAX_FILE_BYTES = 1073741824;
/** Multipart request body default: 10 GiB, aligned with workspace total. 0 = unlimited. */
export declare const DEFAULT_WORKSPACE_UPLOAD_MAX_REQUEST_BYTES = 10737418240;
/** Align with runner default workspace quota: 10 GiB. 0 = unlimited. */
export declare const DEFAULT_WORKSPACE_MAX_BYTES = 10737418240;
export interface WorkspaceUploadLimits {
    maxFileBytes: number;
    maxRequestBytes: number;
    maxWorkspaceBytes: number;
}
export interface MultipartUploadPart {
    bytes: Buffer;
    fieldName: string;
    filename: string;
}
export interface WorkspaceUploadItemResult {
    error?: string;
    hash?: string;
    originalName: string;
    path?: string;
    /** Byte size of the uploaded content; absent on failed entries. */
    size?: number;
    status: "created" | "overwritten" | "renamed" | "failed";
}
export interface WorkspaceUploadResult {
    errors: Array<{
        error: string;
        name: string;
    }>;
    files: WorkspaceFile[];
    uploaded: WorkspaceUploadItemResult[];
}
export declare function parseConflictPolicy(value: string | null | undefined): WorkspaceConflictPolicy;
export declare function sanitizeUploadFilename(filename: string): string;
export declare function readMultipartUploads(request: IncomingMessage, maxRequestBytes: number): Promise<MultipartUploadPart[]>;
export declare function measureWorkspaceBytes(workspaceRoot: string): Promise<number>;
export declare function allocateUploadPath(workspaceRoot: string, filename: string, conflict: WorkspaceConflictPolicy): Promise<{
    path: string;
    status: "created" | "overwritten" | "renamed";
}>;
export declare function writeWorkspaceUpload(options: {
    bytes: Buffer;
    conflict: WorkspaceConflictPolicy;
    filename: string;
    limits: WorkspaceUploadLimits;
    workspaceRoot: string;
    workspaceBytes?: number;
}): Promise<WorkspaceUploadItemResult & {
    absolutePath: string;
    bytesWritten: number;
}>;
export declare function uploadWorkspaceParts(options: {
    conflict: WorkspaceConflictPolicy;
    limits: WorkspaceUploadLimits;
    listFiles: () => Promise<WorkspaceFile[]>;
    parts: MultipartUploadPart[];
    registerArtifact?: (path: string) => Promise<void>;
    workspaceRoot: string;
}): Promise<WorkspaceUploadResult>;
export declare function readFileSha256(path: string): Promise<string>;
/** Map an upload filename to a media type by extension, for the memory graph's
 * SourceFile node. Returns ``undefined`` for unknown extensions so the graph
 * stores an absent (not a wrong) media_type. Case-insensitive on the suffix. */
export declare function inferMediaType(filename: string): string | undefined;
