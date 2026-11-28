import type { ServerResponse } from "node:http";
export declare function send(response: ServerResponse, statusCode: number, contentType: string, body: string | Buffer, extraHeaders?: Record<string, string>): void;
export declare function sendJson(response: ServerResponse, statusCode: number, value: unknown, extraHeaders?: Record<string, string>): void;
export declare function sendError(response: ServerResponse, statusCode: number, error: string, code?: string, details?: Record<string, unknown>): void;
