import { type Server } from "node:http";
import { type ServerConfig } from "../bootstrap/config.js";
import { type ApiServerDependencies } from "../bootstrap/platform.js";
export { aggregateToolText } from "../artifacts/index.js";
export { waitForPermissionDecision } from "../permissions/index.js";
export { prepareSubagentHandoff } from "../subagents/index.js";
export { loadServerConfig, type ServerConfig } from "../bootstrap/config.js";
export * from "../runs/index.js";
export type { ApiServerDependencies } from "../bootstrap/platform.js";
export declare function closeApiServer(server: Server): Promise<void>;
/**
 * The Specialist routes forward plain `Error`s from the store, and the store's
 * wording is the message the settings pane shows. Only the store's own
 * rejections may be answered as client errors; anything else raised in these
 * handlers is an internal fault and must read 500. Exported for the route test.
 */
export declare function specialistErrorStatus(error: unknown): 400 | 404 | undefined;
export declare function createApiServer(config?: ServerConfig, dependencies?: ApiServerDependencies): Server;
export declare function startApiServer(config?: ServerConfig): Promise<Server>;
