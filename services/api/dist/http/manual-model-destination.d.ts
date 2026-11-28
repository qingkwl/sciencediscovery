import type { ManualModelDestination, ModelProfile } from "@sciencediscovery/schema";
/** Optimistic target check for manual settings, independent of Agent approvals. */
export declare function matchesManualModelDestination(profile: ModelProfile, input: unknown): input is ManualModelDestination;
