import type { ConfigurationSettingsConfirmationInput, ConfigurationDecisionInput, ConfigurationPreviewInput, ConfigurationRequestView } from "@sciencediscovery/schema";
import type { ConfigurationHost, ConfigurationProposalInput, ConfigurationRecord } from "./types.js";
import { ConfigurationRepository } from "./repository.js";
import { ConfigurationRegistry } from "./registry.js";
export interface ConfigurationRequestServiceOptions {
    repository: ConfigurationRepository;
    registry: ConfigurationRegistry;
    host: ConfigurationHost;
    now?: () => Date;
}
export declare class ConfigurationRequestService {
    readonly repository: ConfigurationRepository;
    readonly registry: ConfigurationRegistry;
    private readonly host;
    private readonly clock;
    private readonly ownerId;
    constructor(options: ConfigurationRequestServiceOptions);
    getRepository(): ConfigurationRepository;
    getRecord(sessionId: string, id: string): ConfigurationRecord;
    get(sessionId: string, id: string): ConfigurationRequestView;
    list(sessionId: string): ConfigurationRequestView[];
    /** Persist terminal lifecycle facts before returning an error or deduplicating
     * a new proposal. No provider validation or task submission occurs here. */
    reconcileLifecycle(sessionId: string, id?: string): Promise<ConfigurationRequestView[]>;
    private assertLifecycle;
    /** Call once during single-process startup, before accepting new requests. */
    recoverPendingVerifications(): Promise<number>;
    private transact;
    private now;
    private snapshot;
    private scope;
    private checkWritable;
    private guard;
    private plan;
    private refreshDigest;
    private actions;
    /** Every field below is an explicit whitelist; internal record extensions stay server-only. */
    private project;
    private replay;
    propose(sessionId: string, input: ConfigurationProposalInput, key?: string, expectedResourceVersions?: Record<string, string>): Promise<ConfigurationRequestView>;
    private proposeInternal;
    preview(sessionId: string, id: string, input: ConfigurationPreviewInput, key?: string): Promise<ConfigurationRequestView>;
    private context;
    confirmSettings(sessionId: string, id: string, input: ConfigurationSettingsConfirmationInput, key?: string): Promise<ConfigurationRequestView>;
    decide(sessionId: string, id: string, input: ConfigurationDecisionInput, key?: string): Promise<ConfigurationRequestView>;
    private finishVerification;
    private enqueue;
    reversal(sessionId: string, id: string, key?: string): Promise<ConfigurationRequestView>;
}
