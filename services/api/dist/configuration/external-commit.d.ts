import type { SessionStore } from "../store.js";
import type { ConfigurationRepository } from "./repository.js";
import type { ConfigurationRegistry } from "./registry.js";
/** Submit once. Lease recovery and lost responses only query the external journal. */
export declare class ConfigurationExternalCommitCoordinator {
    private readonly store;
    private readonly repository;
    private readonly registry;
    private readonly timeoutMs;
    constructor(store: SessionStore, repository: ConfigurationRepository, registry: ConfigurationRegistry, timeoutMs?: number);
    settle(sessionId: string, requestId: string): Promise<void>;
}
