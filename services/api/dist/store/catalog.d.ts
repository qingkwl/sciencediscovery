import type { ArtifactAnnotation, Environment, EnvironmentRevision, EnvironmentSourceSettings, IdeaTreeSettings, McpProxyPolicies, MemoryGraphSettings, ModelProfile, ModelProvider, ProxyDefaultPolicy, ProxyServer, PermissionEpoch, PermissionGrant, PermissionRequest, Project, RemoteHostTarget, RemoteJob, RemoteWorkspaceSyncRecord, ReviewerSpecialistLevel, RuntimeSettingsOverrides, SandboxNetworkSettings, ScientificArtifact, ScientificArtifactVersion, Session, Specialist, Subagent, SystemQuotaSettings, SystemTimeoutSettings, WebSettings, WorkspaceFileRecord, WorkspaceFileRevision } from "@sciencediscovery/schema";
export interface Catalog {
    artifactAnnotations: ArtifactAnnotation[];
    artifactVersions: ScientificArtifactVersion[];
    artifacts: ScientificArtifact[];
    subagents: Subagent[];
    environments: Environment[];
    environmentRevisions: EnvironmentRevision[];
    environmentSourceSettings: EnvironmentSourceSettings;
    globalSettings: RuntimeSettingsOverrides;
    ideaTreeSettings: IdeaTreeSettings;
    mcpProxyPolicies: McpProxyPolicies;
    memoryGraphSettings: MemoryGraphSettings;
    /** Which NPU cards each Runner may hand to its sandboxes, keyed by Runner id. */
    npuDeviceSelections: Record<string, number[]>;
    models: ModelProfile[];
    permissionEpochs: PermissionEpoch[];
    providers: ModelProvider[];
    proxyDefaultPolicy: ProxyDefaultPolicy;
    proxyNoProxy?: string;
    proxyServers: ProxyServer[];
    permissionGrants: PermissionGrant[];
    permissionRequests: PermissionRequest[];
    projects: Project[];
    quotaSettings: SystemQuotaSettings;
    sandboxNetworkSettings: SandboxNetworkSettings;
    reviewerSpecialistEnabled: boolean;
    reviewerSpecialistFeedbackPolicy: import("@sciencediscovery/schema").ReviewerFeedbackPolicy;
    /** Legacy persisted value retained only while older catalogs are migrated; runtime uses Session settings. */
    reviewerSpecialistLevel: ReviewerSpecialistLevel;
    /**
     * One-time migration flag for the #323/#413 default-on decision. When absent,
     * a persisted `reviewerSpecialistEnabled: false` from the pre-#353 product
     * default is lifted to true once; later user opt-outs set this flag and stay off.
     */
    reviewerSpecialistDefaultOnMigrated?: boolean;
    remoteHosts: RemoteHostTarget[];
    remoteJobs: RemoteJob[];
    remoteWorkspaceSyncs: RemoteWorkspaceSyncRecord[];
    sessions: Session[];
    specialists: Specialist[];
    timeoutSettings: SystemTimeoutSettings;
    webSettings: WebSettings;
    workspaceFileRecords: WorkspaceFileRecord[];
    workspaceFileRevisions: WorkspaceFileRevision[];
    /** One-time migration flag: the file provenance and subagent collections
     *  were moved out of this row into tables of their own. Absent means the
     *  arrays in the saved JSON are still the source and must be seeded. */
    sideTablesSeeded?: boolean;
    /** One-time migration flag: set once the "web" connector id is seeded into
     *  globalSettings.enabledConnectorIds so that the seed never repeats after a
     *  user explicitly removes it. */
    webConnectorMigrated?: boolean;
}
export declare function emptyCatalog(initialTimeoutSettings?: SystemTimeoutSettings, initialQuotaSettings?: SystemQuotaSettings): Catalog;
/** Seeded registry entry preserving the historical default of trusting the
 *  process proxy environment variables. Editable and deletable like any
 *  other entry once operators take over the registry. */
export declare const ENVIRONMENT_PROXY_SERVER_ID = "environment";
export declare function environmentProxyServer(): ProxyServer;
export declare function isRecord(value: unknown): value is Record<string, unknown>;
export declare function hasOwn(value: object, key: PropertyKey): boolean;
