import { type ModelProfile, type ResolvedProxy } from "@sciencediscovery/schema";
import { type ProviderUsageBreakdown } from "./provider-usage.js";
export declare function sanitizeRefinedSessionTitle(value: string): string | undefined;
export interface RefinedSessionTitle {
    finishedAt: string;
    startedAt: string;
    title: string;
    usage: ProviderUsageBreakdown;
}
export declare function generateRefinedSessionTitle(options: {
    apiToken: string;
    fetchImpl?: typeof fetch;
    firstMessage: string;
    model: ModelProfile;
    proxy?: ResolvedProxy;
}): Promise<RefinedSessionTitle>;
