import { type ModelConnectivityTestResult, type ModelProfile, type ResolvedProxy } from "@sciencediscovery/schema";
interface ModelConnectivityTestOptions {
    allowMissingToken?: boolean;
    beforeDispatch?: (profile: ModelProfile) => void;
    apiToken?: string;
    profile: ModelProfile;
    resolveProxy: () => ResolvedProxy;
    timeoutMs?: number;
    compatibility?: boolean;
}
export declare const DEFAULT_MODEL_CONNECTIVITY_TIMEOUT_MS = 10000;
export declare function modelConnectivityTimeoutMs(env?: NodeJS.ProcessEnv): number;
export declare function testModelConnectivity(options: ModelConnectivityTestOptions): Promise<ModelConnectivityTestResult>;
export declare class ModelConnectivityTestCoordinator {
    private readonly inFlight;
    run(modelId: string, test: () => Promise<ModelConnectivityTestResult>): Promise<ModelConnectivityTestResult>;
}
export {};
