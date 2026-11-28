export interface McpRoutingConfig {
    keywords: string[];
    mode: "off" | "prefer";
    priority: number;
}
export interface McpServerEntry {
    args: string[];
    command?: string;
    cwd?: string;
    description: string;
    enabled: boolean;
    env: Record<string, string>;
    headers: Record<string, string>;
    routing: McpRoutingConfig;
    toolCallTimeoutSeconds?: number;
    toolOverrides: Record<string, {
        routing?: McpRoutingConfig;
    }>;
    transport: "http" | "sse" | "stdio";
    url?: string;
}
export interface ExtensionsConfigFile {
    path: string | undefined;
    servers: Record<string, McpServerEntry>;
    /** Content signature for cache invalidation; changes when the file changes. */
    signature: string;
}
/** Server-level routing merged with a per-tool override, `off` filtered out. */
export declare function effectiveRouting(server: McpServerEntry, toolName: string): McpRoutingConfig | undefined;
export declare function resolveExtensionsConfigPath(env?: NodeJS.ProcessEnv): string | undefined;
export declare function loadExtensionsConfig(configPath?: string | undefined): ExtensionsConfigFile;
