import type { CustomMcpServers } from "../mcp/custom-servers.js";
import type { ConfigurationAdapter } from "./types.js";
export type McpMetadataPort = Pick<CustomMcpServers, "configurationMetadata" | "submitConfigurationMetadata" | "resolveConfigurationMetadata">;
export type McpMetadataSnapshot = ReturnType<McpMetadataPort["configurationMetadata"]>;
/** Metadata only. No transport, permission, credential, process or connection operation. */
export declare function createMcpMetadataAdapter(port: McpMetadataPort): ConfigurationAdapter;
