import type { CustomMcpServers } from "../mcp/custom-servers.js";
import type { ConfigurationAdapter } from "./types.js";
export type McpDeletionPort = Pick<CustomMcpServers, "configurationDeletion" | "submitConfigurationDeletion" | "resolveConfigurationMetadata">;
export type McpDeletionSnapshot = ReturnType<McpDeletionPort["configurationDeletion"]>;
export declare function createMcpDeletionAdapter(port: McpDeletionPort): ConfigurationAdapter;
