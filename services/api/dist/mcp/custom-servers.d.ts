import type { CustomMcpServerConfig, CustomMcpServerDetails, McpCatalog, ResolvedProxy } from "@sciencediscovery/schema";
import type { ConfigurationExternalOperation, ConfigurationExternalOutcome } from "../configuration/types.js";
import type { McpSourceRegistry } from "@sciencediscovery/mcp-sources";
import { type ExtensionsConfigFile } from "./extensions-config.js";
import { McpOAuthManager } from "./oauth.js";
export declare function normalizeCustomMcpConfig(value: unknown, previous?: CustomMcpServerConfig): CustomMcpServerConfig;
export declare class CustomMcpServers {
    private readonly dataDir;
    private readonly registry;
    private readonly onIdsChanged;
    private readonly refresh;
    private readonly onRemoved;
    private readonly probeProxy;
    readonly oauth: McpOAuthManager;
    private configs;
    private configurationOperations;
    private pendingConfigurationDeletions;
    private deletionJournal;
    private readonly checks;
    private key?;
    private queue;
    private readonly path;
    private backgroundRefresh;
    private closed;
    constructor(dataDir: string, registry: McpSourceRegistry, onIdsChanged: (ids: string[]) => void, refresh: () => Promise<unknown>, onRemoved?: (id: string) => Promise<void>, probeProxy?: (id: string) => ResolvedProxy | undefined);
    load(): Promise<void>;
    private sync;
    transportConfig(): ExtensionsConfigFile;
    /** Opaque server-only transport/auth binding. A key prevents offline guessing
     * of header/environment secrets; OAuth uses its encrypted vault generation. */
    configurationRevision(sourceIds?: readonly string[]): string;
    /** 以配置及用户授权绑定校验发现结果，允许发现期间正常续期令牌。 */
    discoveryRevision(): string;
    applyCatalog(catalog: McpCatalog): void;
    private cleanError;
    list(): CustomMcpServerDetails[];
    private mutate;
    /** Queue discovery separately from mutations; one failed refresh cannot stop later work. */
    private scheduleRefresh;
    /** Stop scheduling discovery and drain the active refresh before transport shutdown. */
    close(): Promise<void>;
    private persist;
    configurationDeletion(serverId?: string): {
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
    private deletedConfigurationRevision;
    /** Only local, convergent cleanup. Never refresh/probe or replay an invocation. */
    private finishConfigurationDeletion;
    submitConfigurationDeletion(operation: ConfigurationExternalOperation, serverId: string, expectedVersion: string): Promise<ConfigurationExternalOutcome>;
    /** Finite safe catalog; transport values and credentials never leave this service. */
    configurationMetadata(serverId?: string): {
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
    configurationTimeout(serverId?: string): {
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
    /** Header names/counts only. Values and endpoint/execution details never leave the authority. */
    configurationHeaderRemoval(target?: string): {
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
    submitConfigurationHeaderRemoval(operation: ConfigurationExternalOperation, target: string, expectedVersion: string): Promise<ConfigurationExternalOutcome>;
    /** Safe recipient identity only: a saved path/query may itself contain secrets. */
    configurationHeaderCredential(target?: string): {
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
    submitConfigurationHeaderCredential(operation: ConfigurationExternalOperation, target: string, expectedVersion: string, secret: unknown): Promise<ConfigurationExternalOutcome>;
    configurationEnvironmentRemoval(target?: string): {
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
    private configurationEnvironmentRevision;
    submitConfigurationEnvironmentRemoval(operation: ConfigurationExternalOperation, target: string, expectedVersion: string): Promise<ConfigurationExternalOutcome>;
    private configurationMetadataRevision;
    /** A journal row is an idempotency fence, not the server list. One unreadable
     * row must not block startup. A readable identity stays rejected so the same
     * operation cannot be applied again; an identity this build cannot name is
     * dropped because nothing here can replay it. */
    private configurationOperationFromSaved;
    private validateConfigurationOperation;
    private operationOutcome;
    private configurationJournalRejection;
    private recordConfigurationOutcome;
    submitConfigurationMetadata(operation: ConfigurationExternalOperation, serverId: string, expectedVersion: string, values: unknown): Promise<ConfigurationExternalOutcome>;
    submitConfigurationTimeout(operation: ConfigurationExternalOperation, serverId: string, expectedVersion: string, values: unknown): Promise<ConfigurationExternalOutcome>;
    submitConfigurationAvailability(operation: ConfigurationExternalOperation, serverId: string, expectedVersion: string, values: unknown): Promise<ConfigurationExternalOutcome>;
    private submitConfigurationFields;
    /** Absence becomes a durable tombstone, fencing a delayed old submit. */
    resolveConfigurationMetadata(operation: ConfigurationExternalOperation): Promise<ConfigurationExternalOutcome>;
    save(value: unknown, id?: string): Promise<CustomMcpServerDetails>;
    remove(id: string): Promise<void>;
    import(value: unknown): Promise<CustomMcpServerDetails[]>;
    private probe;
    test(id: string): Promise<CustomMcpServerDetails>;
}
