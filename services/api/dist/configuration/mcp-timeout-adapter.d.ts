import type { CustomMcpServers } from "../mcp/custom-servers.js";
import type { ConfigurationAdapter } from "./types.js";
export type McpTimeoutPort = Pick<CustomMcpServers, "configurationTimeout" | "submitConfigurationTimeout" | "resolveConfigurationMetadata">;
export type McpTimeoutSnapshot = ReturnType<McpTimeoutPort["configurationTimeout"]>;
/** Finite per-call policy; no connection, discovery, process or permission change. */
export declare function createMcpTimeoutAdapter(port: McpTimeoutPort): ConfigurationAdapter;
