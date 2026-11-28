import type { CustomMcpServerConfig, McpAuthorizationStart, McpAuthorizationStatus, ResolvedProxy } from "@sciencediscovery/schema";
export declare const MCP_OAUTH_CALLBACK = "/api/mcp/oauth/callback";
export declare function validateOAuthUrl(value: string | URL): URL;
export declare class McpOAuthManager {
    private readonly config;
    private readonly proxyFor;
    private saved;
    private readonly pending;
    private readonly generations;
    private readonly refreshing;
    private readonly challenges;
    private readonly errors;
    private queue;
    private key?;
    /** A ciphertext generation, never an unkeyed fingerprint of an access token. */
    private vaultRevision;
    private readonly path;
    constructor(dataDir: string, config: (id: string) => CustomMcpServerConfig | undefined, proxyFor?: (id: string) => ResolvedProxy | undefined);
    load(key: Buffer): Promise<void>;
    private persist;
    private current;
    private activePending;
    /** Opaque health isolation key; never expose OAuth credentials in diagnostics. */
    credentialScope(id: string): string;
    status(id: string): McpAuthorizationStatus | undefined;
    /** Server-only generation used by configuration CAS; contains no credential values. */
    configurationRevision(sourceIds?: readonly string[]): string;
    /** 仅跟踪用户授权绑定；正常令牌续期仍可发布本轮发现结果。 */
    discoveryRevision(): string;
    cancel(id: string): void;
    clear(id: string): Promise<void>;
    private provider;
    begin(id: string, redirectUrl: string): Promise<McpAuthorizationStart>;
    complete(state: string, code: string | null, denied: boolean): Promise<string>;
    prepare(id: string, rejectedToken?: string, proxy?: ResolvedProxy | undefined): Promise<void>;
    fetchFor(id: string, proxy?: ResolvedProxy | undefined): typeof fetch | undefined;
}
