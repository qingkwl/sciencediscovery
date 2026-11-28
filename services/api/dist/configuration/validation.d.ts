export declare class ConfigurationError extends Error {
    readonly code: string;
    readonly status: number;
    readonly field?: string | undefined;
    readonly retryable: boolean;
    constructor(code: string, message: string, status?: number, field?: string | undefined, retryable?: boolean);
}
export declare function invalid(message: string, field?: string): never;
export declare function object(value: unknown, allowed: readonly string[], name?: string): Record<string, unknown>;
export declare function string(value: unknown, name: string, maximum?: number): string;
export declare function displayText(value: unknown, name: string, maximum?: number): string;
export declare function integer(value: unknown, name: string, minimum?: number): number;
export declare function canonical(value: unknown): string;
export declare function digest(value: unknown): string;
