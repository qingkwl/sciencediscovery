import type { CustomMcpServers } from "../mcp/custom-servers.js";
import type { ConfigurationAdapter } from "./types.js";
export type McpEnvironmentRemovalPort = Pick<CustomMcpServers, "configurationEnvironmentRemoval" | "submitConfigurationEnvironmentRemoval" | "resolveConfigurationMetadata">;
export type McpEnvironmentRemovalSnapshot = ReturnType<McpEnvironmentRemovalPort["configurationEnvironmentRemoval"]>;
export declare function createMcpEnvironmentRemovalAdapter(port: McpEnvironmentRemovalPort): ConfigurationAdapter;
