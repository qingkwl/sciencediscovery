import type { IncomingMessage, ServerResponse } from "node:http";
import { inspectMcpTool } from "../mcp/inspector.js";
import type { CustomMcpServers } from "../mcp/custom-servers.js";
export declare function handleMcpOAuthCallback(request: IncomingMessage, response: ServerResponse, url: URL, servers: CustomMcpServers): Promise<boolean>;
export declare function handleCustomMcpRequest(request: IncomingMessage, response: ServerResponse, url: URL, servers: CustomMcpServers, readBody: () => Promise<unknown>, inspector: Omit<Parameters<typeof inspectMcpTool>[2], "servers">): Promise<boolean>;
