import type { CustomMcpServers } from "../mcp/custom-servers.js";
import type { ConfigurationAdapter } from "./types.js";
export type McpHeaderRemovalPort = Pick<CustomMcpServers, "configurationHeaderRemoval" | "submitConfigurationHeaderRemoval" | "resolveConfigurationMetadata">;
export type McpHeaderRemovalSnapshot = ReturnType<McpHeaderRemovalPort["configurationHeaderRemoval"]>;
/** Remove a selected existing name group without exposing or transmitting any credential value. */
export declare function createMcpHeaderRemovalAdapter(port: McpHeaderRemovalPort): ConfigurationAdapter;
