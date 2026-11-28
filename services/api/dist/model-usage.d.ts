import type { GlobalModelUsageSummary, ModelApiProtocol, ModelProfile, ModelUsageAnalyticsFilters, ModelUsageAnalyticsSummary, ModelUsageCost, ModelInvocationUsage, ModelUsageBucket, ResolvedModelPricing, SessionUsageSummary } from "@sciencediscovery/schema";
export declare function createUsageBucket(key: string, label: string): ModelUsageBucket;
export declare function addUsageToBucket(bucket: ModelUsageBucket, usage: ModelInvocationUsage): void;
export declare function summarizeModelUsage(sessionId: string, records: ModelInvocationUsage[]): SessionUsageSummary;
export interface GlobalUsageContext {
    projectNameById: Map<string, string>;
    projectIdBySessionId: Map<string, string>;
    sessionTitleById: Map<string, string>;
}
export declare function summarizeGlobalModelUsage(records: ModelInvocationUsage[], context: GlobalUsageContext): GlobalModelUsageSummary;
export interface ModelUsageAnalyticsContext extends GlobalUsageContext {
    pricingByModelProfileId?: Map<string, ResolvedModelPricing>;
    /** Dialect that produced a profile's recorded counts, which decides how they are priced. */
    protocolByModelProfileId?: Map<string, ModelApiProtocol>;
}
/** The dialect a profile's requests use, resolved as the model client resolves it. */
export declare function usageDialectOf(profile: Pick<ModelProfile, "apiProtocol" | "baseUrl">): ModelApiProtocol;
export declare function estimateInvocationCost(usage: ModelInvocationUsage, pricing: ResolvedModelPricing | undefined, dialect?: ModelApiProtocol): ModelUsageCost | undefined;
export declare function summarizeModelUsageAnalytics(records: ModelInvocationUsage[], context: ModelUsageAnalyticsContext, filters?: ModelUsageAnalyticsFilters): ModelUsageAnalyticsSummary;
export declare function modelUsageAnalyticsToCsv(summary: ModelUsageAnalyticsSummary, options?: {
    displayCurrency?: ModelUsageCost["currency"];
}): string;
