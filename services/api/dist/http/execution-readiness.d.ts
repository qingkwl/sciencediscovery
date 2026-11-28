import type { IncomingMessage, ServerResponse } from "node:http";
import type { RunnerClient, RemoteComputeClient } from "@sciencediscovery/executor";
import type { SessionStore } from "../store.js";
/** Called only behind the normal control-plane bearer-token check. */
export declare function handleExecutionReadiness(request: IncomingMessage, response: ServerResponse, url: URL, store: SessionStore, local: RunnerClient, remote: RemoteComputeClient, read: () => Promise<unknown>): Promise<boolean>;
