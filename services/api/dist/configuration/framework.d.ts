import type { ConfigurationSettingsConfirmationInput, ConfigurationCredentialInput, ConfigurationDecisionInput, ConfigurationPreviewInput, ConfigurationRequestView, SessionRun } from "@sciencediscovery/schema";
import type { SessionStore } from "../store.js";
import { ConfigurationRepository } from "./repository.js";
import { ConfigurationRequestService } from "./request-service.js";
import { ConfigurationCredentialBridge } from "./credential-bridge.js";
import { type McpEnvironmentRemovalPort } from "./mcp-env-removal-adapter.js";
import { type McpHeaderRemovalPort } from "./mcp-header-removal-adapter.js";
import { type McpAvailabilityPort } from "./mcp-availability-adapter.js";
import { type McpTimeoutPort } from "./mcp-timeout-adapter.js";
import { type McpMetadataPort } from "./mcp-metadata-adapter.js";
import type { ConfigurationApplyReceipt, ConfigurationLiveActivation, ConfigurationProposalInput, ConfigurationRecord } from "./types.js";
import type { ConfigurationActivationEvidence } from "./runtime-bridge.js";
import { ModelDestinationAuthorizer } from "./model-destination.js";
import type { ConfigurationConnectorRegistration } from "./connector-directory.js";
import { type McpDeletionPort } from "./mcp-delete-adapter.js";
import { type McpHeaderCredentialPort } from "./mcp-header-credential-adapter.js";
export interface ConfigurationFrameworkOptions {
    mcpDeletion?: McpDeletionPort;
    mcpHeaderCredential?: McpHeaderCredentialPort;
    mcpMetadata?: McpMetadataPort;
    mcpTimeout?: McpTimeoutPort;
    mcpHeaderRemoval?: McpHeaderRemovalPort;
    mcpEnvironmentRemoval?: McpEnvironmentRemovalPort;
    mcpAvailability?: McpAvailabilityPort;
    connectors?(sessionId: string): readonly ConfigurationConnectorRegistration[];
    connector(sessionId: string, connectorId: string): {
        name: string;
        ready: boolean;
    } | undefined;
    nativeExecutor: boolean;
    /** App-owned, live tool wait; not a durable core interrupt capability. */
    jiuwenLiveWait?: boolean;
    activate?(record: ConfigurationRecord, receipt: ConfigurationApplyReceipt): Promise<ConfigurationActivationEvidence>;
    resume?(sessionId: string, requestId: string): Promise<SessionRun | undefined>;
}
export declare function configurationFramework(store: SessionStore, options?: ConfigurationFrameworkOptions): ConversationalConfigurationFramework;
/** API-owned orchestration. Agents never receive the decision or credential methods. */
export declare class ConversationalConfigurationFramework {
    readonly store: SessionStore;
    options: ConfigurationFrameworkOptions;
    readonly repository: ConfigurationRepository;
    readonly service: ConfigurationRequestService;
    readonly credentials: ConfigurationCredentialBridge;
    readonly destinations: ModelDestinationAuthorizer;
    private waitOwner;
    liveWaitRunId(sessionId: string, requestId: string): string | undefined;
    /** Keep the original Jiuwen tool call open; no replay, permission grant, or new run.
     * Registration/abort/expiry belong to the existing execution wait registry.
     * The configuration scheduler reconciles Stop/expiry and settles terminal cards.
     */
    waitForDecision(sessionId: string, requestId: string, signal?: AbortSignal, activate?: ConfigurationLiveActivation): Promise<ConfigurationRequestView>;
    private readonly phaseQueues;
    private readonly decisionQueues;
    private readonly proposalQueues;
    constructor(store: SessionStore, options: ConfigurationFrameworkOptions);
    configure(options: ConfigurationFrameworkOptions): void;
    private attachMcpMetadata;
    private credentialField;
    private snapshot;
    propose(sessionId: string, input: ConfigurationProposalInput, key?: string): Promise<ConfigurationRequestView>;
    private proposeSerial;
    /** Called only by the authenticated user endpoint; not an Agent tool. */
    confirmEndpoint(sessionId: string, id: string, input: unknown): Promise<ConfigurationRequestView>;
    private credentialNormalization;
    provideCredential(sessionId: string, id: string, input: ConfigurationCredentialInput, key?: string): Promise<{
        handle: string;
        expiresAt: string;
    }>;
    preview(sessionId: string, id: string, input: ConfigurationPreviewInput, key?: string): Promise<ConfigurationRequestView>;
    private assertAutoAuthorized;
    confirmSettings(sessionId: string, id: string, input: ConfigurationSettingsConfirmationInput, key?: string): Promise<ConfigurationRequestView>;
    decide(sessionId: string, id: string, input: ConfigurationDecisionInput, key?: string, source?: "user" | "auto"): Promise<ConfigurationRequestView>;
    private decideSerial;
    /** Lifecycle facts never resubmit, resume, or terminate a research run. */
    reconcileLifecycle(sessionId: string, id?: string, settleLiveWait?: boolean): Promise<void>;
    private update;
    settle(sessionId: string, id: string): Promise<ConfigurationRequestView>;
    private claimPhase;
    private finishPhase;
    private enqueueResume;
    private settleSerial;
    private resume;
    flushNotices(): Promise<void>;
    tick(): Promise<void>;
}
