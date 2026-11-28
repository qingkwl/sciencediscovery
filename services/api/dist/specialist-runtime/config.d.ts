import type { SpecialistRuntime } from "@sciencediscovery/schema";
export declare class SpecialistRuntimeConfigError extends Error {
    readonly code = "SPECIALIST_RUNTIME_INVALID";
}
/** Fail closed: metadata is never an argv, environment or credential channel. */
export declare function normalizeSpecialistRuntime(value: unknown): SpecialistRuntime | undefined;
