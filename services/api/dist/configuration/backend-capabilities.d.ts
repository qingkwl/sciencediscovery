/** DEV-CFG-10 / CFG-T26. An explicit host contract, never inferred from an RPC name/version. */
export interface BackendConfigurationCapabilities {
    protocolVersion: 1;
    backendId: string;
    baseline: {
        workswarmCommit: string | null;
        coreCommit: string | null;
        patches: string[];
    };
    control: {
        conditionalWrite: boolean;
        idempotentOperations: boolean;
        queryOperation: boolean;
    };
    runtime: {
        durableInterrupt: boolean;
        exactResume: boolean;
        targetToolRefresh: boolean;
        durableWaitBinding: boolean;
    };
    settings: Array<{
        id: string;
        schemaVersion: number;
        scopes: string[];
        activationModes: Array<"same_run" | "next_run" | "requires_restart">;
    }>;
    unavailableReasons: string[];
}
export declare const PINNED_JIUWENSWARM_BASELINE: {
    readonly tag: "workswarm0.2.6";
    readonly workswarmCommit: "70aa6715992d9cb2c3ec81ee35991d13747e5ce0";
    readonly coreCommit: "ad0c9dfbbd577423cc60f73edffa0a4699cc53f9";
};
export declare function unsupportedBackendCapabilities(backendId: string, reason: string): BackendConfigurationCapabilities;
export declare function parseBackendCapabilities(value: unknown): BackendConfigurationCapabilities;
export declare function requireExternalControl(capabilities: BackendConfigurationCapabilities, settingId: string, scope: string): void;
export declare function requireSameRun(capabilities: BackendConfigurationCapabilities, settingId: string): void;
export declare function probeBackendCapabilities(options: {
    adapterUrl: string;
    adapterToken?: string;
    fetch?: typeof fetch;
}): Promise<BackendConfigurationCapabilities>;
