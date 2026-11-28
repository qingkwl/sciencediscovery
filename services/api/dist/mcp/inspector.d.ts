import type { McpInspectorRequest, McpInspectorResult } from "@sciencediscovery/schema";
import { type McpGovernanceBroker } from "@sciencediscovery/data-source";
import type { McpSourceRegistry } from "@sciencediscovery/mcp-sources";
import type { SessionStore } from "../store.js";
import type { CustomMcpServers } from "./custom-servers.js";
export declare function inspectMcpTool(id: string, body: McpInspectorRequest, dependencies: {
    servers: CustomMcpServers;
    registry: McpSourceRegistry;
    broker: McpGovernanceBroker;
    store: SessionStore;
}, signal?: AbortSignal): Promise<McpInspectorResult>;
