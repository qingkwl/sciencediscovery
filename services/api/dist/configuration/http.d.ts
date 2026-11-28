import type { IncomingMessage, ServerResponse } from "node:http";
import type { SessionStore } from "../store.js";
import type { ConversationalConfigurationFramework } from "./framework.js";
/** Called after the API's existing bearer/CORS checks. No alternate credential authority. */
export declare function handleConfigurationHttp(input: {
    request: IncomingMessage;
    response: ServerResponse;
    url: URL;
    store: SessionStore;
    framework: ConversationalConfigurationFramework;
    hasActiveRun(sessionId: string, ownRequestId?: string): Promise<boolean>;
}): Promise<boolean>;
