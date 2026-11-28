import type { IncomingMessage } from "node:http";
export declare function readBytes(request: IncomingMessage, maxBytes: number, label: string): Promise<Buffer>;
/**
 * Stream a request body to a file instead of a buffer.
 *
 * A research package can be far larger than the process should hold, so the upload
 * lands on disk while it arrives and the caller parses it from there (#1152 stage 2).
 */
export declare function readBytesToFile(request: IncomingMessage, maxBytes: number, label: string, path: string): Promise<{
    bytes: number;
}>;
export declare function readJson<T>(request: IncomingMessage): Promise<T>;
export declare function readOptionalJson<T>(request: IncomingMessage): Promise<T | undefined>;
export declare function readMultipartSkill(request: IncomingMessage): Promise<{
    bytes: Buffer;
    filename: string;
}>;
