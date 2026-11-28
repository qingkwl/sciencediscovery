import type { ConfigurationCapabilityId, ConfigurationValues, SkillLibrary } from "@sciencediscovery/schema";
import type { ConfigurationLiveActivation, ConfigurationSnapshot } from "./configuration/types.js";
import type { ConfigurationScope, ConfigurationValues as ScopedConfigurationValues } from "@sciencediscovery/schema";
import { ExecutionBlocks } from "@sciencediscovery/governance";
import { PluginControl } from "./plugins/control.js";
import { type AgentStateRef } from "@sciencediscovery/cas";
import { DatabaseSync } from "node:sqlite";
import { AgentNotifications } from "./agent-notifications.js";
import { ShellExecutions } from "./shell-executions.js";
import { WorkspaceTransfers } from "./workspace-transfers.js";
import type { ConnectorConfigurationRequest } from "@sciencediscovery/schema";
export declare function isAutoApplicableConnector(connectorId: string): boolean;
import type { ChatMessage, ArtifactReviewRun, ReviewerAuditTask, ReviewFeedback, ArtifactAnnotation, ArtifactDerivation, ArtifactOrigin, ArtifactOriginMeta, ArtifactExtractionJob, ArtifactJob, ArtifactPlan, CasObjectRef, Claim, ComposerReference, CreateRemoteJobRequest, CreateArtifactAnnotationRequest, CreateSpecialistRequest, DecideRemoteJobRequest, Subagent, SubagentInput, UpdateSubagentBriefRequest, CreateModelProfileRequest, DeletionImpact, Environment, EnvironmentRevision, EnvironmentSourceSettings, EffectiveRuntimeSettings, ExecutionRun, EvidenceLink, EvidenceItem, CreateProxyServerRequest, IdeaTreeSettings, IdeaTreeSettingsDetails, McpProxyPolicies, MemoryGraphSettingsDetails, McpInvocation, ModelFactOverrides, ModelUsageAnalyticsFilters, ModelUsageAnalyticsSummary, ModelInvocationUsage, ModelRunInfo, ModelProfile, ModelProvider, CreateModelProviderRequest, UpdateModelProviderRequest, PaperAcquisition, PaperVisionRun, PermissionAction, PermissionAuthorization, PermissionDecision, PermissionDescription, PermissionEpoch, PermissionGrant, PermissionGrantScope, PermissionRequest, PromptManifest, Project, ProxyDefaultPolicy, ProxyPolicy, ProxyServer, ProxySettingsDetails, ResolvedProxy, RemoteHostCapabilities, RemoteHostConnectionKind, RemoteHostEndpoint, RemoteHostTarget, RemoteJob, RemoteWorkspaceSyncRecord, ReviewRun, SessionReviewerSpecialistSettings, ReviewerSpecialistSettings, ResolvedRuntimeSettings, RuntimeSettingsDetails, RuntimeSettingsField, RuntimeSettingsOverrides, RuntimeSettingsSource, Session, SessionDetail, SessionRun, SessionThinkingControls, SessionRunEvent, SessionRunStatus, SessionUsageSummary, GlobalModelUsageSummary, ScientificArtifact, ScientificArtifactKind, ScientificArtifactVersion, SessionArtifactOutput, SessionListState, SkillDeletionImpact, SandboxNetworkSettings, Specialist, SystemQuotaSettings, SystemTimeoutSettings, TimeoutKind, UpdateIdeaTreeSettingsRequest, UpdateMcpProxyPoliciesRequest, UpdateMemoryGraphSettingsRequest, UpdateEnvironmentSourceSettingsRequest, UpdateModelProfileRequest, UpdateProjectRequest, UpdateProxyServerRequest, UpdateProxySettingsRequest, UpdateSessionRequest, UpdateSpecialistRequest, UpdateWebSettingsRequest, WebSettingsDetails, WorkspaceFile, WorkspaceFileProvenance, WorkspaceFileProvenanceSummary, WorkspaceFileRevision, WorkspaceFileRevisionInput } from "@sciencediscovery/schema";
import { type WebKeyProvider } from "@sciencediscovery/schema";
import { type RemoteHostSecretKind } from "./store/remote-hosts.js";
export { MAIN_RUN_STREAM } from "./store/run-streams.js";
export declare class SessionStoreHttpError extends Error {
    readonly statusCode: 400 | 404 | 409 | 503;
    readonly code?: string | undefined;
    constructor(message: string, statusCode: 400 | 404 | 409 | 503, code?: string | undefined);
}
export declare class SessionEvidenceLockedError extends SessionStoreHttpError {
    readonly code = "SESSION_EVIDENCE_LOCKED";
    constructor();
}
export declare class SessionStore {
    private readonly researchRestoration;
    /** Only the server's restoration service holds this capability. */
    withResearchRestoration<T>(operationId: string, restore: () => Promise<T>): Promise<T>;
    setResearchSnapshots(entries: Array<{
        sessionId: string;
        snapshot: NonNullable<Session["researchSnapshot"]>;
        conversationBranch?: Session["conversationBranch"];
    }>): Promise<void>;
    isResearchRestoring(sessionId: string): boolean;
    clearResearchSnapshot(sessionId: string, operationId: string): Promise<void>;
    /** Server restoration/recovery only; incomplete copies stay out of public lists. */
    researchSessions(projectId: string): Session[];
    researchOperationSessions(operationId: string): Session[];
    readonly executionBlocks: ExecutionBlocks<ConfigurationLiveActivation>;
    readonly dataDir: string;
    private readonly refinedSessionTitles;
    private readonly subagentAuthorityRefs;
    /** File publishers share the Runner's cross-process admission and commit boundary. */
    mutateWorkspace<T>(root: string, kind: string, operation: () => Promise<T>, signal?: AbortSignal): Promise<T>;
    private readonly arrayMutationQueues;
    private readonly streamAppendQueues;
    private readonly streamTailSequences;
    private readonly subagentMutationQueues;
    private readonly workspaceFileMutationQueues;
    private catalog;
    private database?;
    private pluginControl?;
    get plugins(): PluginControl;
    private notificationStore?;
    private shellExecutionStore?;
    private transferStore?;
    private loaded;
    private saveQueue;
    /** Physical reclamation outlives the request that asked for it; deletes queue
     *  here so two large Workspaces are never hashed at the same time. */
    private deletionWork;
    /** Side-table rows whose in-memory value has not reached disk yet. They are
     *  written by `saveCatalog` in the same transaction as the catalog row, so a
     *  reader never sees a catalog naming a file whose row is missing. */
    private readonly pendingWorkspaceFiles;
    private readonly pendingWorkspaceRevisions;
    private readonly pendingSubagents;
    private readonly deletedWorkspaceFiles;
    private readonly deletedWorkspaceRevisions;
    private readonly deletedSubagents;
    /** Rebuilt on demand after a mutation; see `WorkspaceProvenanceIndex`. */
    private workspaceProvenanceCache?;
    private settingsMutationQueue;
    private secretKey?;
    private skillIds;
    private connectorIds;
    private skillSelectionAvailable;
    private readonly initialTimeoutSettings;
    private readonly initialQuotaSettings;
    /**
     * Neo4j password read from `.env` (SCIENCE_AGENT_MEMORY_GRAPH_NEO4J_PASSWORD).
     * Used once on first catalog load to seed the encrypted `memory_graph_secret`
     * table; subsequent loads ignore it — the runtime reads the store. Backward
     * compat for users who had the password in their `.env` before the frontend
     * settings became the sole entry point.
     */
    private readonly initialNeo4jPassword?;
    /** Whether a data directory with no memory-graph settings yet starts with the graph on (see ServerConfig). */
    private readonly memoryGraphAvailable;
    constructor(dataDir: string, initialTimeoutSettings?: SystemTimeoutSettings, initialQuotaSettings?: SystemQuotaSettings, initialNeo4jPassword?: string, memoryGraphAvailable?: boolean);
    get notifications(): AgentNotifications;
    get shellExecutions(): ShellExecutions;
    get transfers(): WorkspaceTransfers;
    private normalizeReviewCriteria;
    private get catalogPath();
    private get catalogDatabasePath();
    private get modelSecretKeyPath();
    private loadOrCreateSecretKey;
    private encryptModelApiToken;
    private decryptModelApiToken;
    private setModelApiToken;
    load(): Promise<void>;
    close(): void;
    /**
     * Persist the catalog. `mutate` runs in the same synchronous turn as the
     * sqlite write, so a reader cannot observe a session that has been removed
     * from memory but not committed. A failed write restores the pre-mutate
     * catalog, including rows added while this save waited for the queue.
     */
    private saveCatalog;
    private cleanupConfigurationSession;
    appendConfigurationRequestNotice(sessionId: string, requestId: string): Promise<void>;
    /** What the catalog row holds: everything but the three collections that are
     *  rows of their own. Building this projection is cheap — it copies the
     *  catalog's own keys, not the arrays. */
    private persistedCatalog;
    private snapshotCatalogForRollback;
    private restoreCatalog;
    /** Write the side-table rows staged since the last save. Called inside the
     *  catalog transaction; `clearPendingSideTables` runs only once it commits. */
    private flushSideTables;
    private clearPendingSideTables;
    private stageWorkspaceFile;
    private stageWorkspaceRevision;
    private stageSubagent;
    /** Stage a Session's subagent rows for deletion, and drop the copies staged
     *  for it — otherwise the flush would put them back. Workspace file provenance
     *  deliberately outlives the Session (its records keep the title so lineage
     *  stays readable), so only the subagents go. Callers remove the same
     *  subagents from `catalog.subagents`; the deletes reach disk inside the same
     *  transaction as that catalog write. */
    private forgetSessionSubagents;
    private forgetProjectSideRows;
    private readSubagentsTable;
    private readWorkspaceProvenanceTables;
    /** How much this build already holds outside the catalog row, so a row that
     *  arrives without the flag can say whether it is a first migration or a
     *  downgrade. */
    private countSideTableRows;
    /** Move an older catalog's inline collections into their tables. Runs once,
     *  during `load`, inside a transaction so 140k rows do not cost 140k fsyncs. */
    private seedSideTables;
    private dropWorkspaceProvenanceCache;
    /** Read-only lookups over file provenance, rebuilt after each mutation. */
    private workspaceProvenance;
    private withSubagentMutation;
    private withWorkspaceFileMutation;
    private saveCatalogWithAuthorizations;
    private appendPermissionAuthorizations;
    private messagesPath;
    private executionRunsPath;
    private sessionRunsPath;
    /** Pre-stream layout: one JSON array per run. Read-only since the JSONL streams landed. */
    private sessionRunEventsPath;
    private runStreamDir;
    private runStreamPath;
    private artifactDerivationsPath;
    private artifactPlansPath;
    private artifactJobsPath;
    private artifactExtractionJobsPath;
    private promptManifestsPath;
    private modelUsagePath;
    private reviewsPath;
    private artifactReviewsPath;
    private reviewerAuditTasksPath;
    private reviewFeedbackPath;
    private paperAcquisitionsPath;
    private paperVisionRunsPath;
    private claimsPath;
    private evidenceLinksPath;
    private evidenceItemsPath;
    private mcpInvocationsPath;
    private knownSessionDataPaths;
    sessionDataPaths(sessionId: string): string[];
    private pathExists;
    private rollbackStagedDeletion;
    private deletionWorkspaceRoots;
    private withDeletionBoundary;
    /** Rename into the journal's staging area. A source that is already gone was
     *  reclaimed by an earlier attempt, so the operation converges instead of
     *  failing on its own history. */
    private stageDeletion;
    /** Record the last tree, then move the data aside and destroy it.
     *
     *  This runs after the catalog commit, so the request that asked for the
     *  deletion has already returned. The fence installed by the retirement is
     *  permanent (state `retired`, released only by a rollback), so no writer is
     *  admitted while this runs — which is why the snapshot may commit without
     *  taking the Workspace lease a second time. A failure leaves the journal in
     *  `.trash`, and recovery finishes the same operation at the next start. */
    private retireDeletedData;
    /** Resolves once every deletion queued so far has been reclaimed physically. */
    whenDeletionsSettle(): Promise<void>;
    /** Resolves once every in-flight array write (session-runs, messages, artifact
     *  plans, …) and every append-only stream write has finished. `closeApiServer`
     *  awaits this immediately before closing the store so that a caller removing
     *  the data directory right after cannot race a write-temp-then-rename that is
     *  still between its two steps.
     *
     *  Bounded: a run that was never cancelled can keep writing status, and a
     *  shutdown must not hang on it. The wait is capped and reports the writes it
     *  abandoned, so a shutdown never claims a cleanliness it did not get. */
    whenWritesSettle(timeoutMs?: number): Promise<boolean>;
    private finishStagedDeletion;
    private recoverTrashOperations;
    private readArray;
    /** Every array write in flight, registered where the write happens rather than
     *  at the caller: `writeArray` is reached both through `mutateArray` and
     *  directly by ~20 sites (messages, artifact plans, prompt manifests, claims,
     *  evidence, …), so a queue keyed on the mutating caller would cover only a
     *  minority of the writes that race teardown. */
    private readonly arrayWrites;
    private writeArray;
    private writeArrayFile;
    private mutateArray;
    private normalizeSettings;
    setCustomConnectorIds(ids: Iterable<string>): void;
    removeCustomConnectorReferences(id: string): Promise<void>;
    setAvailableSkillIds(ids: Iterable<string>): void;
    /**
     * Only Project and Session layers whitelist skills, and only while their
     * resolved mode is `selected` — an `all`-mode layer runs on the live catalog,
     * so a stored list there is inert and must not block deletion.
     */
    getSkillDeletionImpact(skillId: string): SkillDeletionImpact;
    private resolveSettingsLayers;
    private projectSettingsLayers;
    private syncSessionCompatibility;
    private syncSessionCompatibilityForProject;
    private configurationSkillLibrarySource;
    setConfigurationSkillLibrarySource(source: () => SkillLibrary[]): void;
    setSkillSelectionAvailable(available: boolean): void;
    /** Read-only catalog facts for scoped discovery, without collecting unrelated secrets or version hashes. */
    configurationSkillResources(): {
        ids: string[];
        libraries: SkillLibrary[];
        selectionAvailable: boolean;
    };
    private configurationMcpHeaderCredentialSource?;
    setConfigurationMcpHeaderCredentialSource(source: (target: string) => import("./configuration/mcp-header-credential-adapter.js").McpHeaderCredentialSnapshot): void;
    configurationMcpHeaderCredential(target: string): {
        items: {
            id: string;
            name: string;
            transport: "http" | "sse" | "stdio";
            enabled: boolean;
            headers: {
                name: string;
                aliases: number;
            }[];
        }[];
        current: {
            id: string;
            name: string;
            transport: "http" | "sse" | "stdio";
            enabled: boolean;
            headers: {
                name: string;
                aliases: number;
            }[];
        } | undefined;
        header: {
            name: string;
            aliases: number;
        } | undefined;
        version: string | undefined;
        target: string;
        destination: {
            endpointTarget: string;
            host: string;
            origin: string;
            classification: "loopback" | "private_network" | "public_https" | "public_http";
        } | undefined;
    };
    private configurationMcpDeletionSource?;
    setConfigurationMcpDeletionSource(source: (id: string) => import("./configuration/mcp-delete-adapter.js").McpDeletionSnapshot): void;
    configurationMcpDeletion(id: string): {
        version: string | undefined;
        items: {
            id: string;
            name: string;
            description: string;
            transport: "http" | "sse" | "stdio";
            enabled: boolean;
        }[];
        current: {
            id: string;
            name: string;
            description: string;
            transport: "http" | "sse" | "stdio";
            enabled: boolean;
        } | undefined;
    };
    private configurationMcpEnvironmentRemovalSource?;
    setConfigurationMcpEnvironmentRemovalSource(source: (target: string) => import("./configuration/mcp-env-removal-adapter.js").McpEnvironmentRemovalSnapshot): void;
    configurationMcpEnvironmentRemoval(target: string): {
        items: {
            id: string;
            name: string;
            transport: "http" | "sse" | "stdio";
            enabled: boolean;
            variables: {
                name: string;
                aliases: number;
                effect: "launcher_default" | "not_inherited" | "proxy_policy";
            }[];
        }[];
        current: {
            id: string;
            name: string;
            transport: "http" | "sse" | "stdio";
            enabled: boolean;
            variables: {
                name: string;
                aliases: number;
                effect: "launcher_default" | "not_inherited" | "proxy_policy";
            }[];
        } | undefined;
        variable: {
            name: string;
            aliases: number;
            effect: "launcher_default" | "not_inherited" | "proxy_policy";
        } | undefined;
        caseSensitive: boolean;
        version: string | undefined;
    };
    private configurationMcpHeaderRemovalSource?;
    setConfigurationMcpHeaderRemovalSource(source: (target: string) => import("./configuration/mcp-header-removal-adapter.js").McpHeaderRemovalSnapshot): void;
    configurationMcpHeaderRemoval(target: string): {
        items: {
            id: string;
            name: string;
            transport: "http" | "sse" | "stdio";
            enabled: boolean;
            headers: {
                name: string;
                aliases: number;
            }[];
        }[];
        current: {
            id: string;
            name: string;
            transport: "http" | "sse" | "stdio";
            enabled: boolean;
            headers: {
                name: string;
                aliases: number;
            }[];
        } | undefined;
        header: {
            name: string;
            aliases: number;
        } | undefined;
        version: string | undefined;
    };
    private configurationMcpAvailabilitySource?;
    setConfigurationMcpAvailabilitySource(source: (id: string) => import("./configuration/mcp-availability-adapter.js").McpAvailabilitySnapshot): void;
    configurationMcpAvailability(id: string): {
        items: {
            id: string;
            name: string;
            description: string;
            transport: "http" | "sse" | "stdio";
            enabled: boolean;
        }[];
        current: {
            id: string;
            name: string;
            description: string;
            transport: "http" | "sse" | "stdio";
            enabled: boolean;
        } | undefined;
        version: string | undefined;
    };
    private configurationMcpTimeoutSource?;
    setConfigurationMcpTimeoutSource(source: (id: string) => import("./configuration/mcp-timeout-adapter.js").McpTimeoutSnapshot): void;
    configurationMcpTimeout(id: string): {
        items: {
            id: string;
            name: string;
            description: string;
            transport: "http" | "sse" | "stdio";
            enabled: boolean;
            timeoutSeconds: number;
        }[];
        current: {
            id: string;
            name: string;
            description: string;
            transport: "http" | "sse" | "stdio";
            enabled: boolean;
            timeoutSeconds: number;
        } | undefined;
        version: string | undefined;
    };
    private configurationMcpMetadataSource?;
    setConfigurationMcpMetadataSource(source: (id: string) => import("./configuration/mcp-metadata-adapter.js").McpMetadataSnapshot): void;
    configurationMcpMetadata(id: string): {
        items: {
            id: string;
            name: string;
            description: string;
            transport: "http" | "sse" | "stdio";
            enabled: boolean;
        }[];
        current: {
            id: string;
            name: string;
            description: string;
            transport: "http" | "sse" | "stdio";
            enabled: boolean;
        } | undefined;
        version: string | undefined;
    };
    private configurationMcpProxySource;
    setConfigurationMcpProxySource(source: () => Array<{
        id: string;
        name: string;
        connectorIds: string[];
    }>): void;
    /** Only safe catalog facts: never resolve/decrypt proxy URLs or MCP credentials. */
    configurationMcpProxySettings(): {
        defaultPolicy: ProxyDefaultPolicy;
        services: {
            id: string;
            name: string;
            connectorIds: string[];
            proxyPolicy: ProxyPolicy;
        }[];
        servers: {
            id: string;
            name: string;
            kind: import("@sciencediscovery/schema").ProxyServerKind;
        }[];
    };
    applyMcpProxyConfigurationSync(serverId: string, proxyPolicy: ProxyPolicy): void;
    private configurationConnectorRevisionSource?;
    setConfigurationConnectorRevisionSource(source: (ids?: readonly string[]) => string): void;
    /** DEV-CFG-02: share the catalog connection with requests, receipts and outbox. */
    getConfigurationDatabase(): DatabaseSync;
    /** No awaits or network calls inside the SQLite boundary. Domain and audit roll back together. */
    runConfigurationTransaction<T>(sessionId: string, action: () => T): Promise<T>;
    configurationSnapshot(sessionId: string, capabilityId: ConfigurationCapabilityId, target: string): ConfigurationSnapshot;
    configurationSecretCipher(): {
        encrypt(id: string, secret: string): string;
        decrypt(id: string, ciphertext: string): string;
    };
    getGlobalSettings(): RuntimeSettingsDetails;
    /** The policy new Permission Epochs snapshot. */
    private currentSandboxNetworkAccess;
    getSandboxNetworkSettings(): SandboxNetworkSettings;
    /**
     * Save the sandbox network policy and rotate the Permission Epoch of every
     * writable Session whose snapshot no longer matches. Rotation is what makes
     * the change take effect: the epoch id is part of the runner's persistent
     * kernel and shell reuse key, so sessions started under the old policy can
     * never serve an execution granted under the new one.
     */
    replaceSandboxNetworkSettings(value: unknown): Promise<{
        rotatedSessionIds: string[];
        settings: SandboxNetworkSettings;
    }>;
    configurationInheritanceCandidate(sessionId: string, scope: ConfigurationScope, fields: readonly string[]): {
        before: RuntimeSettingsOverrides;
        next: RuntimeSettingsOverrides;
        effective: EffectiveRuntimeSettings;
        sources: Record<RuntimeSettingsField, RuntimeSettingsSource>;
    };
    applyConfigurationInheritanceSync(sessionId: string, scope: ConfigurationScope, fields: readonly string[]): void;
    /** Mutate the in-memory catalog inside the configuration transaction. The commit writes catalog_state. */
    applySystemConfigurationSync(capabilityId: ConfigurationCapabilityId, values: ScopedConfigurationValues): void;
    /** The same formal runtime settings and reviewer state as the settings pages, in the shared audit transaction. */
    applyP1ConfigurationSync(sessionId: string, capabilityId: ConfigurationCapabilityId, values: ScopedConfigurationValues, scope: ConfigurationScope): void;
    private applySessionReviewerSpecialistSettingsSync;
    getTimeoutSettings(): SystemTimeoutSettings;
    getQuotaSettings(): SystemQuotaSettings;
    getEnvironmentSourceSettings(): EnvironmentSourceSettings;
    updateEnvironmentSourceSettings(input: UpdateEnvironmentSourceSettingsRequest): Promise<EnvironmentSourceSettings>;
    getReviewerSpecialistSettings(): ReviewerSpecialistSettings;
    applyReviewerParticipationSync(enabled: boolean): void;
    private applyReviewerSpecialistSettingsSync;
    updateReviewerSpecialistSettings(value: unknown): Promise<ReviewerSpecialistSettings>;
    getSessionReviewerSpecialistSettings(sessionId: string): SessionReviewerSpecialistSettings;
    updateSessionReviewerSpecialistSettings(sessionId: string, value: unknown): Promise<SessionReviewerSpecialistSettings>;
    getWebSettings(): WebSettingsDetails;
    getWebProviderApiKey(provider: WebKeyProvider): string | undefined;
    /** Uses the formal Web settings/key writer in the shared audit transaction. */
    applyWebCredentialConfigurationSync(provider: WebKeyProvider, value: string | null): void;
    configurationWebProxyPolicies(): string[];
    /** Non-credential Web edits use the same formal normalizer and shared audit transaction. */
    applyWebConfigurationSync(input: Omit<UpdateWebSettingsRequest, "providerApiKeys">): void;
    private applyWebSettingsSync;
    updateWebSettings(input: UpdateWebSettingsRequest): Promise<WebSettingsDetails>;
    private getProxyServer;
    /** Reject policies that point at a proxy server missing from the registry. */
    private assertProxyPolicyKnown;
    private proxyRegistryView;
    /** Resolve a module policy (undefined behaves like "inherit") into the
     *  transport-agnostic instruction consumed by outbound callers. */
    resolveProxy(policy?: ProxyPolicy): ResolvedProxy;
    /**
     * The outbound route the egress gateway should use for one execution, taken
     * from the policy that execution's Permission Epoch snapshotted rather than
     * from the current settings — the epoch is what was granted.
     *
     * Returns `undefined` for a sandbox with no network, so an unrelated proxy
     * misconfiguration cannot fail an execution that never dials out. Both
     * `domain-allowlist` and `open` route through the gateway, so both carry an
     * outbound route. The result is resolved per execution and never written into
     * the epoch: a custom proxy URL is stored encrypted and must not reach the
     * persisted catalog.
     */
    resolveSandboxEgressProxy(epoch: PermissionEpoch): ResolvedProxy | undefined;
    /** Construct the authenticated settings projection without ever attaching a
     *  decrypted URL to the persisted catalog object. */
    private proxyServerSettingsView;
    getProxySettings(): ProxySettingsDetails;
    /** Decrypt the stored URL of a custom_url entry (server-internal only). */
    getProxyServerUrl(serverId: string): string | undefined;
    updateProxySettings(input: UpdateProxySettingsRequest): Promise<ProxySettingsDetails>;
    /** Metadata only: never reads proxy environment values or decrypts a URL. */
    configurationProxyResources(): ProxyServer[];
    renameProxyResourceConfigurationSync(serverId: string, name: string): void;
    private createProxyServerSync;
    createProxyServer(input: CreateProxyServerRequest): Promise<ProxyServer>;
    private updateProxyServerSync;
    updateProxyServer(serverId: string, input: UpdateProxyServerRequest): Promise<ProxyServer>;
    private deleteProxyServerSync;
    deleteProxyServer(serverId: string): Promise<void>;
    getMcpProxyPolicies(): McpProxyPolicies;
    /** Effective policy for one MCP server; unlisted servers inherit. */
    mcpProxyPolicy(serverId: string): ProxyPolicy;
    private applyMcpProxyPoliciesSync;
    updateMcpProxyPolicies(input: UpdateMcpProxyPoliciesRequest): Promise<McpProxyPolicies>;
    replaceTimeoutSettings(value: unknown): Promise<SystemTimeoutSettings>;
    replaceQuotaSettings(value: unknown): Promise<SystemQuotaSettings>;
    /** Memory-graph settings without the live sidecar health — the HTTP layer
     *  merges `memoryGraphStatus` (it owns the client). The password is never
     *  returned; only whether one is stored. */
    getMemoryGraphSettings(): Omit<MemoryGraphSettingsDetails, "memoryGraphStatus">;
    /** Decrypt the stored Neo4j password (undefined when none is stored). Used
     *  by the HTTP layer to push to the sidecar on startup, on password PUT,
     *  and for the GET-time self-heal re-push. */
    getMemoryGraphNeo4jPassword(): string | undefined;
    /** Only the local gate is exposed to conversational configuration; never project a destination or decrypt a credential. */
    configurationMemoryGraph(): {
        enabled: boolean;
        backend: "local" | "neo4j";
    };
    applyMemoryGraphParticipationSync(enabled: boolean): void;
    updateMemoryGraphSettings(input: UpdateMemoryGraphSettingsRequest): Promise<Omit<MemoryGraphSettingsDetails, "memoryGraphStatus">>;
    /** The Idea Tree parameters a Session runs with: the global settings with
     *  that Session's own overrides applied field by field. No override means the
     *  global value unchanged, which is what every Session had before this. A
     *  research created in this Session reads this — see `createIdeaResearchClient`. */
    resolveIdeaTreeSettings(sessionId: string): IdeaTreeSettings;
    /** Idea Tree system settings: the deployment-wide values. Persisted in the
     *  catalog JSON (the settings table) and filled from `DEFAULT_IDEA_TREE_SETTINGS`
     *  for any missing field. A Session may override them; `resolveIdeaTreeSettings`
     *  is what a research reads. */
    getIdeaTreeSettings(): IdeaTreeSettings;
    /** Idea Tree settings as returned to the UI. Currently identical to the
     *  stored settings (no live status to merge, unlike the memory-graph
     *  view), but exposed as `IdeaTreeSettingsDetails` so the HTTP layer can
     *  return the documented view shape without the store leaking its internal
     *  type. */
    getIdeaTreeSettingsDetails(): IdeaTreeSettingsDetails;
    /** Persist an Idea Tree settings update. Each field is independent — only
     *  the keys present in the payload move. The normalizer validates numeric
     *  ranges and rejects template-owned fields. */
    updateIdeaTreeSettings(input: UpdateIdeaTreeSettingsRequest): Promise<IdeaTreeSettings>;
    getProjectSettings(projectId: string): RuntimeSettingsDetails;
    getSessionSettings(sessionId: string): RuntimeSettingsDetails;
    /** What the Session's next Run can be asked to think at: the controls of its effective model. */
    getSessionThinkingControls(sessionId: string): SessionThinkingControls;
    resolveRuntimeSettings(sessionId: string): ResolvedRuntimeSettings;
    /** Serialize inherited settings before reading or mutating the shared catalog. */
    private withSettingsMutation;
    listConnectorConfigurationRequests(sessionId: string): ConnectorConfigurationRequest[];
    getConnectorConfigurationRequest(sessionId: string, requestId: string): ConnectorConfigurationRequest | undefined;
    /** V2 uses the existing request solely to bind the Native checkpoint and scheduler. */
    resolveConnectorConfigurationCompanionSync(sessionId: string, requestId: string, state: "applied" | "dismissed" | "stale", source?: "user" | "auto"): void;
    withdrawConnectorAutoApply(sessionId: string, requestId: string): void;
    listDueConnectorConfigurationRequests(nowIso: string, limit?: number): ConnectorConfigurationRequest[];
    deferConnectorConfigurationAutoApply(requestId: string, nextCheckAtIso: string): void;
    invalidateConnectorConfigurationRequestsForStop(sessionId: string, runId?: string): void;
    proposeConnectorConfiguration(input: {
        sessionId: string;
        runId: string;
        connectorId: string;
        connectorName: string;
        reason: string;
        /** Trusted v3 framework: its needKey guard decides whether a resolved need may be evaluated again. */
        configurationProtocolVersion?: 3;
    }): ConnectorConfigurationRequest;
    decideConnectorConfiguration(input: {
        sessionId: string;
        requestId: string;
        decision: "apply" | "dismiss";
        source?: "user" | "auto";
        assertReady?: (connectorId: string) => void;
    }): Promise<ConnectorConfigurationRequest>;
    /** One durable decision handoff for every registered capability. */
    ensureConfigurationContinuationRun(input: {
        sessionId: string;
        requestId: string;
    }): Promise<SessionRun | undefined>;
    /** The request ID gives the continuation a stable identity across retries and restarts. */
    ensureConnectorContinuationRun(input: {
        sessionId: string;
        requestId: string;
    }): Promise<SessionRun | undefined>;
    private replaceRuntimeOverridesSync;
    configurationJsonViewerSettings(sessionId: string): {
        installed: boolean;
        modes: {
            global: string;
            project: string;
            session: string;
        };
        inherited: {
            global: boolean;
            project: boolean;
            session: boolean;
        };
    };
    applyJsonViewerConfigurationSync(sessionId: string, mode: "enabled" | "disabled" | "inherit", scope: ConfigurationScope): void;
    replaceGlobalSettings(value: unknown): Promise<RuntimeSettingsDetails>;
    /** Remove a model default only when this caller still owns that slot. */
    clearGlobalModelIfCurrent(modelId: string): Promise<{
        cleared: boolean;
    }>;
    replaceProjectSettings(projectId: string, value: unknown, assertCurrent?: () => void): Promise<RuntimeSettingsDetails>;
    /** ApplyPort: compare, mutate and persist the candidate receipt in one SQLite transaction. */
    commitPluginSettings(projectId: string, value: unknown, assertCurrent: () => void, receipt: () => void): Promise<void>;
    /** Keep an existing unavailable choice while validating every new field value. */
    private normalizeSessionOverrides;
    replaceSessionSettings(sessionId: string, value: unknown, assertCurrent?: () => void): Promise<RuntimeSettingsDetails>;
    listProjects(): Project[];
    /** Runtime proof deliberately excludes unrelated settings, catalogs and model defaults. */
    configurationRuntimeVersions(connectorIds: readonly string[], plugins?: RuntimeSettingsOverrides["plugins"], sessionId?: string): Record<string, string>;
    /** Finite domain operations, callable only from the configuration transaction. */
    applyConfigurationDomainSync(sessionId: string, capabilityId: ConfigurationCapabilityId, values: ConfigurationValues, apiToken?: string): {
        modelId?: string;
    };
    listModels(): ModelProfile[];
    getModel(modelId?: string): ModelProfile | undefined;
    getModelApiToken(modelId?: string): string | undefined;
    getProviderApiToken(providerId?: string): string | undefined;
    /**
     * Whether a run may start without any saved token.
     *
     * There is no separate "this endpoint needs no token" switch: saving a
     * provider with an empty token is that statement, which is what local
     * endpoints (Ollama), gateways that authenticate by network position, and
     * test stubs rely on. A standalone profile with no provider still needs its
     * own token, because nothing else vouches for the endpoint.
     */
    modelAllowsMissingToken(profile: ModelProfile): boolean;
    /** Validate an optional model proxy policy (default inherit) against the
     *  registry before it is stored. */
    private normalizeModelProxyPolicy;
    createModel(input: CreateModelProfileRequest): Promise<ModelProfile>;
    /** Adding a model should make the app usable without a second, separate
     * "select it as the task model" step: while no global task model is chosen,
     * the model being configured becomes the global default. An explicit choice
     * (existing `modelId` override) is never overwritten. */
    private defaultGlobalTaskModel;
    private normalizeConnectionUpdateToken;
    private applyModelMetadataSync;
    configurationModelApiIdentityCandidate(profile: ModelProfile, values: ConfigurationValues): Omit<ModelProfile, "createdAt" | "hasApiToken" | "id" | "proxyPolicy" | "updatedAt">;
    private applyModelApiIdentitySync;
    applyModelApiIdentityConfigurationSync(modelId: string, values: ConfigurationValues): void;
    updateModel(modelId: string, input: UpdateModelProfileRequest): Promise<ModelProfile>;
    deleteModel(modelId: string, replacementModelId?: string | null): Promise<void>;
    /** Catalog, defaults, compatibility mirrors and encrypted secrets commit together. */
    private removeModelResources;
    /** Validate that a replacement model id is a string that exists and is not one
     *  of the models being deleted. `null` is an explicit "leave unset" sentinel. */
    private validateReplacementModelId;
    /** Clear defaults while retaining explicit session overrides as unavailable choices. */
    private clearRuntimeModelReferences;
    listProviders(): ModelProvider[];
    getProvider(providerId?: string): ModelProvider | undefined;
    /** Internal discovery-cache identity. Credential generations are ciphertext, never plaintext key hashes. */
    providerDiscoveryRevision(providerId: string): string | undefined;
    private setProviderApiToken;
    private profileHasOwnToken;
    /** Mirror provider connection changes onto its profiles. The API variant is
     *  only reset when the protocol family changed, so a per-model variant
     *  choice under the same protocol survives provider edits. */
    private syncProviderModels;
    createProvider(input: CreateModelProviderRequest): Promise<ModelProvider>;
    configurationProviderConnectionSource(providerId: string): {
        provider: ModelProvider | undefined;
        children: ModelProfile[];
    };
    private normalizeProviderConnection;
    configurationProviderConnectionCandidate(provider: ModelProvider, values: ConfigurationValues): Omit<ModelProvider, "createdAt" | "hasApiToken" | "id" | "proxyPolicy" | "tokenOptional" | "updatedAt">;
    private applyProviderConnectionSync;
    applyProviderConnectionConfigurationSync(providerId: string, values: ConfigurationValues): void;
    /** Shared by formal settings and the transactional conversational credential adapter. */
    private applyProviderCredentialSync;
    applyProviderCredentialConfigurationSync(providerId: string, apiToken: string): void;
    removeProviderCredentialConfigurationSync(providerId: string): void;
    private applyProviderUpdateSync;
    updateProvider(providerId: string, input: UpdateModelProviderRequest): Promise<ModelProvider>;
    applyProviderProxyConfigurationSync(providerId: string, proxyPolicy: ProxyPolicy): void;
    configurationProviderProxySettings(): {
        defaultPolicy: ProxyDefaultPolicy;
        providers: {
            id: string;
            name: string;
            proxyPolicy: ProxyPolicy;
            modelCount: number;
        }[];
        servers: {
            id: string;
            name: string;
            kind: import("@sciencediscovery/schema").ProxyServerKind;
        }[];
    };
    deleteProvider(providerId: string, replacementModelId?: string | null): Promise<void>;
    /** Ensure a profile backs the given provider/model pair so the rest of the
     *  product (runs, usage, review model) keeps operating on profile ids. */
    materializeProviderModel(providerId: string, modelId: string, options?: {
        facts?: ModelFactOverrides;
        label?: string;
        setGlobalDefault?: boolean;
        vision?: boolean;
    }): Promise<ModelProfile>;
    createProject(name: string, input?: RuntimeSettingsOverrides, remoteRunnerHostIds?: string[], runnerIds?: string[], description?: string): Promise<Project>;
    /** Throws when another Project already answers to `name`. */
    private assertProjectNameFree;
    /**
     * The single Project that holds standalone conversations.
     *
     * It is a real Project — settings, runner allowlist, workspace directory —
     * so everything that keys on `projectId` keeps working, but it is server
     * owned: `kind` is set here and never by a request, it is left out of
     * `GET /api/projects`, it cannot be renamed and it cannot be deleted.
     *
     * Idempotent, and serialized on the settings queue so two first calls in one
     * process cannot create two. `kind` is part of the record before the first
     * write, so a concurrent reader never sees a kind-less Project that would
     * list like a user's.
     */
    ensureInboxProject(): Promise<Project>;
    /**
     * The Projects a client may list. `listProjects` still returns every Project,
     * including the inbox: recovery, runtime status, runner binding and usage all
     * have to see it.
     */
    listUserProjects(): Project[];
    /** The shared record builder: one place that applies every default a Project
     *  needs, so the inbox cannot be a partial object. */
    private buildProject;
    updateProject(projectId: string, changes: UpdateProjectRequest): Promise<Project>;
    private applyProjectRunnerSelection;
    private validateProjectRemoteRunnerHosts;
    private validateRunnerIds;
    private registeredRunnerIds;
    effectiveRunnerIds(sessionId: string): string[];
    /** Selection discovery deliberately avoids the credential-decrypting host description API. */
    configurationRunnerResources(): Array<{
        id: string;
        name: string;
        available: boolean;
    }>;
    configurationRunnerSelection(sessionId: string): {
        projectRunnerIds: string[];
        selectionMode: "inherit" | "selected";
        runnerIds: string[];
        effectiveRunnerIds: string[];
    };
    applyRunnerConfigurationSync(sessionId: string, scope: ConfigurationScope, selectionMode: "inherit" | "selected", runnerIds: string[]): void;
    private sessionRunnerSelectionPatch;
    private applySessionRunnerSelection;
    assertSessionAllowsRunner(sessionId: string, runnerId: string): void;
    /**
     * Session overrides select from the global usable catalog independently of
     * Project defaults. The same host existence/capability checks still apply.
     */
    private validateSessionRemoteRunnerHosts;
    /**
     * The machines this Session may use right now: its own override when it has
     * one, otherwise the Project defaults, filtered by current host usability.
     * The local entry is handled separately by assertSessionAllowsRunner.
     */
    effectiveRemoteRunnerHosts(sessionId: string): RemoteHostTarget[];
    /** The host, when this Session is allowed to use it; throws with the reason otherwise. */
    assertSessionAllowsRemoteRunner(sessionId: string, hostId: string): RemoteHostTarget;
    getProject(projectId: string): Project | undefined;
    listSessions(projectId: string, state?: SessionListState): Session[];
    createSession(projectId: string, title: string, input?: RuntimeSettingsOverrides | string, governance?: {
        approvalMode?: "always_allow" | "ask_for_dangerous";
        autoApplyLowRiskConfiguration?: boolean;
        reviewCriteria?: string[];
        reviewMode?: "auto" | "manual";
        remoteRunnerHostIds?: string[];
        runnerIds?: string[];
        specialistId?: string;
    }, options?: {
        allowUnconfiguredModel?: boolean;
        /** Choose a saved model for a new interactive session when no default is set. */
        selectFallbackModel?: boolean;
        researchSnapshot?: Session["researchSnapshot"];
        restorationSessionId?: string;
    }): Promise<Session>;
    getSession(sessionId: string): Session | undefined;
    /** Session-scoped Codex credential uses the platform encrypted secret channel. */
    codexApiKey(sessionId: string): string | undefined;
    runtimeApiKey(sessionId: string, kind: "codex" | "claude-code" | "acp"): string | undefined;
    configureCodex(subagentId: string, inputId: string, apiKey: string, fallback?: boolean): void;
    configureRuntime(subagentId: string, inputId: string, apiKey: string, fallback?: boolean): void;
    listSpecialists(): Specialist[];
    getSpecialist(specialistId?: string): Specialist | undefined;
    private normalizeSpecialistInput;
    createSpecialist(input: CreateSpecialistRequest): Promise<Specialist>;
    updateSpecialist(specialistId: string, input: UpdateSpecialistRequest): Promise<Specialist>;
    deleteSpecialist(specialistId: string): Promise<void>;
    listSubagents(sessionId: string): Subagent[];
    /** One child of a Session, with its steps.
     *
     * The panel shows one child at a time, so a reader opening a record should
     * not pay for copying every sibling's text. Deliberately not implemented as
     * `listSubagents(...).find(...)`: that clones the whole roster before
     * choosing from it, which is the cost this method exists to avoid. */
    getSubagent(sessionId: string, subagentId: string): Subagent | undefined;
    /** Immutable audit references; filter before copying or serializing trajectories. */
    captureSubagentAuthorities(sessionId: string, subagentId?: string): Promise<{
        id: string;
        parentTurnId: string;
        status: "cancelled" | "completed" | "failed" | "running" | "timed_out";
        record: AgentStateRef;
    }[]>;
    createSubagent(sessionId: string, parentTurnId: string, input: SubagentInput, execution?: {
        maxTurns?: number;
        /** The bound the engine enforces, which is lower than `maxTurns` when the
         *  configured budget is above the engine ceiling (#1106). */
        effectiveMaxTurns?: number;
        model?: ModelRunInfo;
        specialistConfigHash?: string;
        timeoutSeconds?: number;
    }): Promise<Subagent>;
    updateSubagent(subagent: Subagent): Promise<Subagent>;
    /**
     * Put children a Session already ran into the catalog.
     *
     * A Session that arrives as a recording — the seeded sample is one — replays
     * the run it has on disk, and a run stream keeps its `subagent.updated`
     * snapshots without their steps. The catalog is the one place a finished
     * child's execution is readable, and only a live child writes it, so a
     * Session restored from a recording has to bring its rows along or every
     * child opens on nothing. A row that is already here is left alone.
     */
    restoreSubagents(subagents: Subagent[]): Promise<void>;
    /** Archive data only: imported tasks never acquire runnable context or handoffs. */
    restoreHistoricalSubagent(subagent: Subagent): Promise<void>;
    updateSubagentBrief(sessionId: string, subagentId: string, input: UpdateSubagentBriefRequest): Promise<Subagent>;
    reconcileWorkspaceFiles(sessionId: string, files: Array<Pick<WorkspaceFile, "modifiedAt" | "path" | "size">>, baseline?: ReadonlyMap<string, string>, options?: {
        scanComplete?: boolean;
        onMutation?: () => void;
    }): Promise<Map<string, WorkspaceFileProvenanceSummary>>;
    snapshotWorkspaceFileRevisions(sessionId: string): Map<string, string>;
    recordWorkspaceFileRevision(sessionId: string, input: WorkspaceFileRevisionInput): Promise<WorkspaceFileRevision>;
    recordWorkspaceFileRevisions(sessionId: string, inputs: WorkspaceFileRevisionInput[]): Promise<WorkspaceFileRevision[]>;
    /** Restore archive metadata after all artifact versions and sessions exist. */
    restoreWorkspaceFileProvenance(sessionId: string, snapshots: WorkspaceFileProvenance[]): Promise<void>;
    getWorkspaceFileProvenance(sessionId: string, pathInput: string): WorkspaceFileProvenance | undefined;
    listArtifacts(sessionId: string): ScientificArtifact[];
    /**
     * Declared Artifact versions that this Session's agent or subagents produced.
     *
     * The project-level Artifact catalog intentionally represents the latest
     * logical product, while a conversation needs the exact version generated in
     * one Session. `turnId` is required because older or user-uploaded versions
     * cannot be safely attached to a chat Run.
     */
    listSessionArtifactOutputs(sessionId: string): SessionArtifactOutput[];
    listProjectArtifacts(projectId: string): ScientificArtifact[];
    getArtifact(sessionId: string, artifactId: string): ScientificArtifact | undefined;
    getProjectArtifact(projectId: string, artifactId: string): ScientificArtifact | undefined;
    deleteArtifact(projectId: string, artifactId: string): Promise<ScientificArtifact>;
    getArtifactByName(sessionId: string, name: string): ScientificArtifact | undefined;
    private artifactSharesResearchScope;
    listArtifactVersions(sessionId: string, artifactId: string): ScientificArtifactVersion[];
    listProjectArtifactVersions(projectId: string, artifactId: string): ScientificArtifactVersion[];
    getArtifactVersion(sessionId: string, versionId: string): ScientificArtifactVersion | undefined;
    getProjectArtifactVersion(projectId: string, versionId: string): ScientificArtifactVersion | undefined;
    /** The newest version of a report-style artifact (markdown/latex/report)
     * in a session. Used to back-fill chip references after declare_claim runs,
     * because the report file is written (and its version created) BEFORE
     * declare_claim produces the chip_map — see the provenance recorder. */
    latestReportVersion(sessionId: string): {
        artifactId: string;
        versionId: string;
    } | undefined;
    /** Back-fill chip references onto a report version after declare_claim
     * produced its chip_map. Idempotent: callers skip when references already
     * set. Persists immediately so chips survive reloads. */
    updateArtifactVersionReferences(sessionId: string, versionId: string, references: ComposerReference[]): void;
    /** Non-destructive snapshot of the chip references on the newest report
     * version (markdown/latex/report). Returns the cloned list so a caller can
     * copy them onto the assistant message that carries the same report prose —
     * the message is what the conversation transcript renders when a run has no
     * replayable timeline (failed run, empty assistantMessageId), and without
     * these references its [alias] tokens would render as plain text. Empty
     * when the session has no report version or the version carries no chips. */
    latestReportReferences(sessionId: string): ComposerReference[];
    /** Back-fill chip references onto an assistant message so the conversation
     * transcript renders [alias] tokens as clickable chips the same way the
     * report Artifact preview does. Persists immediately so chips survive
     * reloads. No-op when the message is gone or already carries references. */
    updateMessageReferences(sessionId: string, messageId: string, references: ComposerReference[]): Promise<void>;
    /**
     * #1300: allocation never trusts `artifact.currentVersion`, which can lag
     * behind the versions on disk, and it never hands out a number that is already
     * stored for this Artifact.
     */
    private nextArtifactVersionNumber;
    createArtifactVersion(input: {
        artifactId?: string;
        baseVersionId?: string;
        publicationId?: string;
        content: CasObjectRef;
        description?: string;
        executionRunIds?: string[];
        inputArtifactVersionIds?: string[];
        kind: ScientificArtifactKind;
        logicalName: string;
        mediaType: string;
        origin?: ArtifactOrigin;
        originMeta?: ArtifactOriginMeta;
        /** Chip references for a report version (alias → graph node). Persisted on
         * the version so chips survive reloads; absent on non-report versions. */
        references?: ComposerReference[];
        sessionId: string;
        sourcePath?: string;
        title?: string;
        turnId?: string;
        /** Importers can preserve same-named products as independent Session artifacts. */
        forceNewArtifact?: boolean;
        /** Caller explicitly wants a new version number even when the bytes match
         * the newest version (for example an annotation-only republish). Without
         * it, an explicit publish of an unchanged body is a no-op (#1317). */
        forceNewVersion?: boolean;
        /** Server restoration only; preallocated identities resolve forward references. */
        restorationIds?: {
            artifactId: string;
            versionId: string;
        };
    }): Promise<{
        artifact: ScientificArtifact;
        version: ScientificArtifactVersion;
    }>;
    listArtifactAnnotations(sessionId: string, versionId?: string): ArtifactAnnotation[];
    restoreArtifactAnnotations(sessionId: string, annotations: ArtifactAnnotation[]): Promise<void>;
    /** Resolve imported lineage after every version has been allocated. */
    restoreArtifactVersionLineage(sessionId: string, versionId: string, inputArtifactVersionIds: string[], createdAt: string, originalVersion?: number, originalBaseVersionId?: string): Promise<void>;
    restoreArtifactMetadata(sessionId: string, artifactId: string, source: ScientificArtifact): Promise<void>;
    /** Compensation only for unpublished copies created by this operation. Shared CAS stays intact. */
    discardResearchCopies(operationId: string): Promise<void>;
    createArtifactAnnotation(sessionId: string, versionId: string, input: CreateArtifactAnnotationRequest): Promise<ArtifactAnnotation>;
    attachArtifactAnnotations(sessionId: string, annotationIds: string[], messageId: string): Promise<ArtifactAnnotation[]>;
    /** Which secrets exist for a machine; the values themselves never leave the API. */
    private describeRemoteHostSecrets;
    listRemoteHosts(): RemoteHostTarget[];
    getRemoteHost(hostId: string): RemoteHostTarget | undefined;
    /**
     * Everything needed to reach an SSH machine: where it is, who to log in as,
     * the secret that proves it, and the key the user accepted. Assembled here so
     * probing, deployment and the runner tunnel cannot drift apart.
     */
    remoteHostSshAccess(hostId: string): {
        credentials: {
            passphrase?: string;
            password?: string;
            privateKey?: string;
            username: string;
        };
        destination: string;
        port?: number;
        trustedHostKey?: {
            algorithm: string;
            fingerprint: string;
        };
    };
    /**
     * Store key material for a machine: either a key file this host could read or
     * a pair the product generated. The material only ever arrives from the API
     * process itself — it is never accepted from a browser.
     */
    setRemoteHostPrivateKey(hostId: string, privateKey: string | null): Promise<RemoteHostTarget>;
    /** Record the key a user accepted for a machine, replacing any earlier one. */
    trustRemoteHostKey(hostId: string, key: {
        algorithm: string;
        fingerprint: string;
    }): Promise<RemoteHostTarget>;
    registerRemoteHost(input: {
        id?: string;
        runnerName?: string;
        description?: string;
        alias: string;
        capabilities?: RemoteHostCapabilities;
        connectionKind?: RemoteHostConnectionKind;
        endpoint?: RemoteHostEndpoint;
        error?: string;
        /** SSH port; undefined preserves an existing value, null clears it. */
        port?: number | null;
        runnerCommand?: string;
        /** Connection token of a self-deployed runner; `undefined` keeps the stored one. */
        token?: string;
        /** SSH login user; `undefined` keeps the stored one. */
        username?: string;
        /** Address to connect to when it differs from the name the user typed. */
        hostName?: string;
        /** SSH secrets; `undefined` keeps what is stored, `null` forgets it. */
        password?: string | null;
        privateKey?: string | null;
        passphrase?: string | null;
        trustHostKey?: {
            algorithm: string;
            fingerprint: string;
        };
    }): Promise<RemoteHostTarget>;
    /** Which NPU cards a Runner may hand to its sandboxes; empty when it uses none. */
    npuDeviceSelection(runnerId: string): number[];
    /** Every Runner's NPU selection, for the settings surface. */
    npuDeviceSelections(): Record<string, number[]>;
    /**
     * Record which NPU cards one Runner may hand to sandboxes. The caller has
     * already checked them against that Runner's probe; storing host indices
     * rather than a count keeps the mapping meaningful as cards come and go.
     * Keyed by Runner id so the local Runner, which has no machine record, is
     * stored exactly like a remote one.
     */
    setNpuDeviceSelection(runnerId: string, devices: readonly number[]): Promise<number[]>;
    /**
     * A stored secret of a remote machine: the runner token of a self-deployed
     * runner, or the password, private key or passphrase used to log into an SSH
     * machine. They stay encrypted beside the model credentials and are never
     * written to the catalog JSON or returned over HTTP; only the outbound
     * connection reads them back.
     */
    remoteHostSecret(hostId: string, kind: RemoteHostSecretKind): string | undefined;
    /** Back-compatible name for the self-deployed runner's connection token. */
    remoteHostToken(hostId: string): string | undefined;
    /**
     * Runner tokens lived one-per-host before SSH passwords and keys needed rows
     * of their own. Each is re-encrypted under its new context so a machine's
     * secrets all live in one table under one rule, rather than leaving a row
     * that would fail to decrypt.
     */
    private migrateRemoteHostTokens;
    private setRemoteHostSecret;
    deleteRemoteHost(hostId: string): Promise<void>;
    listRemoteWorkspaceSyncs(sessionId: string): RemoteWorkspaceSyncRecord[];
    appendRemoteWorkspaceSync(record: RemoteWorkspaceSyncRecord): Promise<void>;
    listRemoteJobs(sessionId: string): RemoteJob[];
    getRemoteJob(sessionId: string, jobId: string): RemoteJob | undefined;
    createRemoteJob(sessionId: string, input: CreateRemoteJobRequest, context?: {
        executionId?: string;
        toolCallId?: string;
    }): Promise<RemoteJob>;
    decideRemoteJob(sessionId: string, jobId: string, input: DecideRemoteJobRequest, memoryLostReason?: string): Promise<RemoteJob>;
    applyRemoteJobPermissionDecision(permissionRequestId: string): Promise<RemoteJob | undefined>;
    updateRemoteJob(job: RemoteJob): Promise<RemoteJob>;
    assertSessionWritable(sessionId: string): Session;
    archiveSession(sessionId: string): Promise<Session>;
    restoreSession(sessionId: string): Promise<Session>;
    getSessionDeletionImpact(sessionId: string): DeletionImpact;
    getProjectDeletionImpact(projectId: string): DeletionImpact;
    deleteSession(sessionId: string, confirmationId: string): Promise<void>;
    deleteProject(projectId: string, confirmationId: string): Promise<void>;
    updateSession(sessionId: string, changes: UpdateSessionRequest): Promise<Session>;
    compareAndSetSessionTitle(sessionId: string, expectedTitle: string, nextTitle: string, source?: "refinement" | "user_request"): Promise<Session | undefined>;
    getPermissionEpoch(epochId: string): PermissionEpoch | undefined;
    getSessionPermissionEpoch(sessionId: string): PermissionEpoch | undefined;
    listPermissionEpochs(sessionId: string): PermissionEpoch[];
    rotatePermissionEpoch(sessionId: string, reason: string, memoryLostReason?: string, executeGrantScope?: PermissionGrantScope): Promise<PermissionEpoch>;
    listPermissionRequests(sessionId?: string): PermissionRequest[];
    listPermissionGrants(): PermissionGrant[];
    getPermissionGrant(grantId: string): PermissionGrant | undefined;
    getPermissionRequest(requestId: string): PermissionRequest | undefined;
    listPermissionAuthorizations(sessionId: string, filters?: {
        executionId?: string;
    }): PermissionAuthorization[];
    getPermissionAuthorization(authorizationId: string): PermissionAuthorization | undefined;
    ensureLegacyPermissionAuthorization(sessionId: string, action: PermissionAction, resource: string, permissionGrantId: string): Promise<PermissionAuthorization>;
    private createPermissionAuthorization;
    /**
     * The JiuwenSwarm backend: its permission engine already decided about the tool call (and asked the user when its
     * policy says so), so the privileged action is allowed here and recorded as JiuwenSwarm's decision.
     *
     * JiuwenSwarm's own ask (`chat.ask_user_question`, mapped by `requestApproval` in runs/index.ts through the usual
     * `requestPermission`/mode-switch/decide machinery) already recorded an authorization for this same tool call
     * before the call was ever allowed to reach this bridge-side check — this function used to always mint a second
     * one regardless, so every JiuwenSwarm-gated call double-booked one decision as two authorization rows (caught by
     * server.test.ts's exact-count assertions once a run made more than one gated call). Reuse that first record by
     * `toolCallId` instead of creating a redundant one; a call whose tool was never asked about (not in
     * `JIUWENSWARM_ASK_TOOLS`, so JiuwenSwarm allowed it without a question) has no such record and still gets one
     * created here, as before.
     */
    authorizeByJiuwenSwarm(sessionId: string, action: PermissionAction, resourceValue: string, context?: {
        executionId?: string;
        toolCallId?: string;
    }): Promise<{
        allowed: true;
        authorization: PermissionAuthorization;
    }>;
    requestPermission(sessionId: string, action: PermissionAction, resourceValue: string, summaryValue: string, context?: {
        description?: PermissionDescription;
        executionId?: string;
        toolCallId?: string;
    }): Promise<{
        allowed: true;
        authorization: PermissionAuthorization;
    } | {
        allowed: false;
        request: PermissionRequest;
    }>;
    decidePermissionRequest(requestId: string, decision: PermissionDecision, memoryLostReason?: string): Promise<{
        authorization: PermissionAuthorization;
        authorizations: PermissionAuthorization[];
        grant?: PermissionGrant;
        permissionEpoch: PermissionEpoch;
        request: PermissionRequest;
        resolvedRequests: PermissionRequest[];
    }>;
    cancelPendingPermissionRequest(requestId: string): Promise<PermissionRequest | undefined>;
    cancelPendingPermissionRequests(executionId: string): Promise<PermissionRequest[]>;
    setApprovalMode(sessionId: string, approvalMode: Session["approvalMode"], memoryLostReason?: string): Promise<{
        authorizations: PermissionAuthorization[];
        permissionEpoch: PermissionEpoch;
        resolvedPendingRequests: PermissionRequest[];
        session: Session;
    }>;
    revokePermissionGrant(grantId: string, memoryLostReason?: string): Promise<PermissionGrant>;
    listEnvironmentRevisions(): EnvironmentRevision[];
    listEnvironments(): Environment[];
    replaceScientificEnvironmentCatalog(environments: Environment[], revisions: EnvironmentRevision[], runnerId?: string): Promise<void>;
    getSessionDetail(sessionId: string): Promise<SessionDetail | undefined>;
    readMessages(sessionId: string): Promise<ChatMessage[]>;
    /** Restore an immutable transcript from a validated research package. */
    restoreMessages(sessionId: string, messages: ChatMessage[]): Promise<ChatMessage[]>;
    listSessionRuns(sessionId: string): Promise<SessionRun[]>;
    getSessionRun(sessionId: string, runId: string): Promise<SessionRun | undefined>;
    /** Import historical runs atomically as terminal records, never briefly queue them. */
    restoreSessionRun(sessionId: string, imported: SessionRun): Promise<SessionRun>;
    createSessionRun(input: {
        notificationDelivery?: SessionRun["notificationDelivery"];
        automaticWake?: boolean;
        wakeAfterRunId?: string;
        wakeAttempt?: number;
        annotationIds?: string[];
        prompt: string;
        references?: ComposerReference[];
        retryOfRunId?: string;
        sessionId: string;
        settingsSnapshot: SessionRun["settingsSnapshot"];
        skillLibraryRefs?: SessionRun["skillLibraryRefs"];
        webForceRefresh?: boolean;
    }): Promise<SessionRun>;
    updateSessionRun(sessionId: string, runId: string, changes: Partial<Omit<SessionRun, "id" | "queueOrder" | "sessionId">>): Promise<SessionRun>;
    updateSessionRunStatus(sessionId: string, runId: string, status: SessionRunStatus, details?: Partial<Pick<SessionRun, "assistantMessageId" | "error" | "finishedAt" | "startedAt" | "userMessageId">>): Promise<SessionRun>;
    updateSessionRunStatusIfCurrent(sessionId: string, runId: string, expectedStatus: SessionRunStatus, status: SessionRunStatus, details?: Partial<Pick<SessionRun, "assistantMessageId" | "error" | "finishedAt" | "startedAt" | "userMessageId">>): Promise<SessionRun | undefined>;
    listSessionRunEvents(sessionId: string, runId: string, after?: number): Promise<SessionRunEvent[]>;
    listRunStreamEvents(sessionId: string, runId: string, streamId: string, after?: number): Promise<SessionRunEvent[]>;
    /**
     * One event type out of a run stream, without materialising the rest.
     *
     * The plan panel asks for `plan.updated` on every state query
     * (`plugins/control.ts`), and reading the whole stream first made a panel
     * refresh cost every delta of the run — the same allocation the cursor read
     * above was fixed for (#1011). The envelope is identical to
     * `listRunStreamEvents`, so a caller can swap between them.
     */
    listRunStreamEventsOfType(sessionId: string, runId: string, streamId: string, type: SessionRunEvent["event"]["type"]): Promise<SessionRunEvent[]>;
    /**
     * The two readers above share the same two-source walk and envelope, only the
     * per-record predicate differs. Keeping it in one place means a third reader
     * adds a predicate instead of a copy of the read-and-sort body.
     */
    private readRunStreamEvents;
    appendSessionRunEvent(sessionId: string, runId: string, event: SessionRunEvent["event"]): Promise<SessionRunEvent>;
    exportRunStreams(sessionId: string, runId: string): Promise<Array<{
        streamId: string;
        events: SessionRunEvent[];
    }>>;
    /**
     * How many events `exportRunStreams` would return, without materialising them.
     *
     * The `necessary` package profile drops its run streams and only keeps the count
     * for the receipt (#1365). Reading every event into arrays first made a small
     * package pay for the whole run history twice; this walks the same streams and
     * counts their records one line at a time, so the count stays exact while the
     * events themselves never accumulate.
     */
    countRunStreamEvents(sessionId: string, runId: string, excludeStreamIds?: ReadonlySet<string>): Promise<number>;
    /** Restore archived observations without publishing live events or replaying work. */
    restoreRunStream(sessionId: string, runId: string, streamId: string, events: SessionRunEvent[]): Promise<void>;
    appendRunStreamEvent(sessionId: string, runId: string, streamId: string, event: SessionRunEvent["event"]): Promise<SessionRunEvent>;
    /**
     * First append to a stream in this process: repair a torn tail left by a
     * crash mid-write, then resume the sequence counter. The main stream also
     * continues past a pre-stream `<runId>.json` array so recovery events for
     * legacy runs keep monotonic sequences.
     */
    private recoverStreamTail;
    /**
     * Yield the stream's records one line at a time. Only a single line is held
     * besides the caller's own accumulation, so a large file no longer needs a
     * whole second copy of itself on the heap just to be parsed.
     */
    private streamLines;
    /**
     * Drop a partial line left by a crash mid-write. Only the file's tail is
     * examined: a torn record is by definition the last one, so scanning the
     * final window is enough and keeps the cost independent of file size.
     */
    private repairTornStreamTail;
    listExecutionRuns(sessionId: string): Promise<ExecutionRun[]>;
    appendExecutionRun(run: ExecutionRun): Promise<void>;
    listArtifactDerivations(sessionId: string): Promise<ArtifactDerivation[]>;
    appendArtifactPlan(plan: ArtifactPlan): Promise<void>;
    listArtifactPlans(sessionId: string): Promise<ArtifactPlan[]>;
    replaceArtifactPlan(plan: ArtifactPlan): Promise<void>;
    appendArtifactJob(job: ArtifactJob): Promise<void>;
    listArtifactJobs(sessionId: string): Promise<ArtifactJob[]>;
    replaceArtifactJob(job: ArtifactJob): Promise<void>;
    appendArtifactExtractionJob(job: ArtifactExtractionJob): Promise<void>;
    listArtifactExtractionJobs(sessionId: string): Promise<ArtifactExtractionJob[]>;
    replaceArtifactExtractionJob(job: ArtifactExtractionJob): Promise<void>;
    appendArtifactDerivations(sessionId: string, additions: ArtifactDerivation[]): Promise<void>;
    listPromptManifests(sessionId: string): Promise<PromptManifest[]>;
    appendPromptManifest(manifest: PromptManifest): Promise<void>;
    private normalizeModelInvocationUsage;
    listModelInvocationUsage(sessionId: string): Promise<ModelInvocationUsage[]>;
    appendModelInvocationUsage(usage: ModelInvocationUsage): Promise<void>;
    getSessionUsageSummary(sessionId: string): Promise<SessionUsageSummary>;
    listAllModelInvocationUsage(): Promise<ModelInvocationUsage[]>;
    getGlobalModelUsageSummary(): Promise<GlobalModelUsageSummary>;
    private modelUsagePricingByProfileId;
    /** Dialect per profile, because recorded counts are shaped by it and cost depends on that shape. */
    private modelUsageProtocolByProfileId;
    getModelUsageAnalyticsSummary(filters?: ModelUsageAnalyticsFilters): Promise<ModelUsageAnalyticsSummary>;
    listReviews(sessionId: string): Promise<ReviewRun[]>;
    listArtifactReviews(sessionId: string, artifactVersionId?: string): Promise<ArtifactReviewRun[]>;
    appendArtifactReview(review: ArtifactReviewRun): Promise<void>;
    listReviewerAuditTasks(sessionId: string): Promise<ReviewerAuditTask[]>;
    createReviewerAuditTask(task: ReviewerAuditTask): Promise<ReviewerAuditTask>;
    updateReviewerAuditTask(sessionId: string, taskId: string, update: Partial<Pick<ReviewerAuditTask, "artifactVersionIds" | "checkpointPublishedAt" | "errorSummary" | "finishedAt" | "inputFingerprint" | "notBefore" | "reviewIds" | "skipReason" | "startedAt" | "status" | "supersededBy">>): Promise<ReviewerAuditTask>;
    listReviewFeedback(sessionId: string): Promise<ReviewFeedback[]>;
    appendReviewFeedback(feedback: ReviewFeedback): Promise<ReviewFeedback>;
    consumeReviewFeedback(sessionId: string, feedbackId: string): Promise<ReviewFeedback | undefined>;
    appendMcpInvocation(invocation: McpInvocation): Promise<void>;
    listMcpInvocations(sessionId: string): Promise<McpInvocation[]>;
    appendPaperAcquisition(acquisition: PaperAcquisition): Promise<void>;
    listPaperAcquisitions(sessionId: string): Promise<PaperAcquisition[]>;
    appendPaperVisionRun(run: PaperVisionRun): Promise<void>;
    listPaperVisionRuns(sessionId: string): Promise<PaperVisionRun[]>;
    appendEvidence(sessionId: string, claims: Claim[], links: EvidenceLink[]): Promise<void>;
    listClaims(sessionId: string): Promise<Claim[]>;
    listEvidenceLinks(sessionId: string): Promise<EvidenceLink[]>;
    appendEvidenceItems(sessionId: string, additions: EvidenceItem[]): Promise<void>;
    listEvidenceItems(sessionId: string): Promise<EvidenceItem[]>;
    appendReview(review: ReviewRun): Promise<void>;
    appendReviewNotice(sessionId: string, reviews: ReviewRun[]): Promise<ChatMessage | undefined>;
    appendMessage(sessionId: string, role: ChatMessage["role"], content: string, model?: Pick<ModelProfile, "id" | "name">, references?: ComposerReference[], annotationIds?: string[], kind?: ChatMessage["kind"], modelContext?: ChatMessage["modelContext"], runtimeNotice?: ChatMessage["runtimeNotice"]): Promise<ChatMessage>;
    appendReviewerCheckpointMessage(sessionId: string, messageId: string, toolCallId: string): Promise<ChatMessage>;
    updateReviewerCheckpointMessage(sessionId: string, messageId: string, update: {
        content: string;
        error?: string;
        skipReason?: NonNullable<ChatMessage["reviewerCheckpoint"]>["skipReason"];
        status: NonNullable<ChatMessage["reviewerCheckpoint"]>["status"];
    }): Promise<ChatMessage>;
    /** Persist a small reviewer queue snapshot while the checkpoint is running. */
    updateReviewerCheckpointProgress(sessionId: string, messageId: string, progress: NonNullable<ChatMessage["reviewerCheckpoint"]>["progress"]): Promise<ChatMessage>;
    /** Remove a transient automatic-audit shell before it reaches the lead Agent. */
    deleteReviewerCheckpointMessage(sessionId: string, messageId: string): Promise<void>;
    appendTimeoutMessage(sessionId: string, content: string, timeout: {
        kind: TimeoutKind;
        reason: string;
        timeoutMs: number;
    }, model?: Pick<ModelProfile, "id" | "name">): Promise<ChatMessage>;
    workspacePath(sessionId: string): string;
    /** Stable Agent-instance × Runner identity. Paths are never used as an authorization grant. */
    workspaceIdentity(sessionId: string, agentId?: string, runnerId?: string): {
        id: string;
        sessionId: string;
        agentId: string;
        runnerId: string;
    };
    agentWorkspacePath(sessionId: string, subagentId: string): string;
    createAgentWorkspace(sessionId: string, subagentId: string): Promise<void>;
    /** Resolve persisted logical audit paths without mounting child Workspaces inside the parent. */
    workspaceLocation(sessionId: string, logicalPath: string): {
        root: string;
        path: string;
    };
    /** Content-addressed root for one selected Skill set, shared by every run that selects it. */
    skillPackagesPath(sessionId: string, packageSetHash: string): string;
}
