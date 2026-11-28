import type { CustomMcpServers } from "../mcp/custom-servers.js";
import type { ConfigurationCredentialBridge } from "./credential-bridge.js";
import type { ConfigurationAdapter, ConfigurationAdapterContext } from "./types.js";
export type McpHeaderCredentialPort = Pick<CustomMcpServers, "configurationHeaderCredential" | "submitConfigurationHeaderCredential" | "resolveConfigurationMetadata">;
export type McpHeaderCredentialSnapshot = ReturnType<McpHeaderCredentialPort["configurationHeaderCredential"]>;
export declare function createMcpHeaderCredentialAdapter(port: McpHeaderCredentialPort, credentials: ConfigurationCredentialBridge, assertConsent: (context: ConfigurationAdapterContext) => void): ConfigurationAdapter;
