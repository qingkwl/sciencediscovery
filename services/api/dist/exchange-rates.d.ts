import type { ModelUsageExchangeRate } from "@sciencediscovery/schema";
export interface UsageExchangeRateConfig {
    enabled: boolean;
    sourceUrl: string;
    timeoutMs: number;
    ttlMs: number;
}
export declare class UsageExchangeRateProvider {
    private readonly cachePath;
    private readonly config?;
    private readonly fetchImpl;
    private readonly now;
    constructor(options: {
        config?: UsageExchangeRateConfig;
        dataDir: string;
        fetchImpl?: typeof fetch;
        now?: () => Date;
    });
    rates(): Promise<ModelUsageExchangeRate[]>;
    private readCache;
    private fetchRates;
}
