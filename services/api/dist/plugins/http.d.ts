import type { IncomingMessage, ServerResponse } from "node:http";
import type { PluginControl } from "./control.js";
/** Called only after the API's bearer authentication. Path owns the scope. */
export declare function handlePluginRequest(request: IncomingMessage, response: ServerResponse, url: URL, control: PluginControl, readJson: () => Promise<unknown>): Promise<boolean>;
