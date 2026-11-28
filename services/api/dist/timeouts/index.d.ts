import type { TimeoutKind } from "@sciencediscovery/schema";
export declare function timeoutFailure(error: unknown): {
    kind: TimeoutKind;
    reason: string;
    timeoutMs: number;
} | undefined;
export declare function timeoutMessage(timeout: {
    kind: TimeoutKind;
    reason: string;
    timeoutMs: number;
}): string;
