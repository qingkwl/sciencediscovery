export declare const MCP_PROXY_ENV_VARS: readonly ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "all_proxy", "no_proxy"];
export declare function canonicalMcpEnvironmentName(name: string, platform?: NodeJS.Platform): string;
/** Name-only launcher facts; this never reads an inherited environment value. */
export declare function mcpEnvironmentRemovalEffect(name: string): "proxy_policy" | "launcher_default" | "not_inherited";
