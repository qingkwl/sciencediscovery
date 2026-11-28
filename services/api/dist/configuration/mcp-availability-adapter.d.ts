import type { CustomMcpServers } from "../mcp/custom-servers.js";
import type { ConfigurationAdapter } from "./types.js";
export type McpAvailabilityPort = Pick<CustomMcpServers, "configurationMetadata" | "submitConfigurationAvailability" | "resolveConfigurationMetadata">;
export type McpAvailabilitySnapshot = ReturnType<McpAvailabilityPort["configurationMetadata"]>;
/** This global availability decision never inherits a tool or automatic configuration permission. */
export declare function createMcpAvailabilityAdapter(port: McpAvailabilityPort): ConfigurationAdapter;
