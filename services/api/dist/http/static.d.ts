import type { ServerResponse } from "node:http";
export declare function contentTypeForPath(pathname: string): string;
export declare function serveStatic(response: ServerResponse, staticDir: string, pathname: string): Promise<void>;
