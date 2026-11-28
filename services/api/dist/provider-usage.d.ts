import { type UsageAliasConflict } from "@sciencediscovery/model";
import type { ModelApiProtocol, ModelUsageStatus } from "@sciencediscovery/schema";
export interface ProviderUsageBreakdown {
    cacheReadTokens: number | null;
    cacheWriteTokens: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    reasoningTokens: number | null;
    totalTokens: number | null;
    usageStatus: ModelUsageStatus;
    aliasConflict?: UsageAliasConflict;
}
/** API accounting uses the same dialect rules as streaming model calls. */
export declare function parseProviderUsage(value: unknown, protocol?: ModelApiProtocol): ProviderUsageBreakdown;
