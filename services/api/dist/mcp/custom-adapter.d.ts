import type { CustomMcpServerConfig, McpCatalogTool, McpSourceAdapter } from "@sciencediscovery/schema";
export declare function customMcpAdapter(id: string, config: CustomMcpServerConfig, discovered: McpCatalogTool[]): McpSourceAdapter;
