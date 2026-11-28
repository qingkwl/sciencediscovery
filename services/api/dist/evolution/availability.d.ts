export declare const EVOLVE_UNINITIALIZED = "Evolve is not initialized. Select Init Evolve to download and install it.";
export declare class EvolveUnavailableError extends Error {
    readonly code = "EVOLVE_UNAVAILABLE";
}
export interface EvolveConnection {
    url: string;
    internalToken: string;
}
export interface EvolveConfiguration extends EvolveConnection {
    controlUrl?: string;
    controlToken?: string;
}
export interface EvolveStatus {
    state: "not_initialized" | "installing" | "ready" | "error";
    canInitialize: boolean;
    error?: string;
}
/** Never guesses an endpoint. Managed credentials stay between launcher and API. */
export declare class EvolveAvailability {
    private readonly config;
    private current;
    private readonly external;
    private pending?;
    constructor(config: EvolveConfiguration);
    get ready(): boolean;
    refresh(initialize?: boolean): Promise<EvolveStatus>;
    private refreshOnce;
    connection(): Promise<EvolveConnection>;
}
