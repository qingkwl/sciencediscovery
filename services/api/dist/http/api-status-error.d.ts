export declare class ApiStatusError extends Error {
    readonly statusCode: number;
    /** Machine-readable reason, so a client can act on it instead of matching prose. */
    readonly code?: string | undefined;
    /** Structured payload the client needs to offer a next step. */
    readonly details?: Record<string, unknown> | undefined;
    constructor(statusCode: number, message: string, 
    /** Machine-readable reason, so a client can act on it instead of matching prose. */
    code?: string | undefined, 
    /** Structured payload the client needs to offer a next step. */
    details?: Record<string, unknown> | undefined);
}
