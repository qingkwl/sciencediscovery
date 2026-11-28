import { type OperationalLogger } from "@sciencediscovery/operational-logging";
import type { McpAttempt, McpCatalog, McpInvokeRequest, McpInvokeResponse, ResolvedProxy } from "@sciencediscovery/schema";
import { type ExtensionsConfigFile } from "./extensions-config.js";
import type { McpOAuthManager } from "./oauth.js";
/** Environment variables that make a stdio subprocess honour a resolved proxy. */
export declare function proxyEnvOverlay(proxy: ResolvedProxy | undefined): Record<string, string>;
/**
 * Interpreter for the bundled Python MCP servers (biomed, UniProt, LLM Wiki).
 *
 * An explicit `SCIENCE_AGENT_GATEWAY_PYTHON_PATH` always wins. Otherwise the
 * venvs this repository provisions are probed under the API's real data dir
 * (`<data dir>/envs/gateway` from `scripts/start-stack.sh`, `<data dir>/envs/
 * sd-services` from `scripts/start-stack.mjs` and packaged installs,
 * `$SCIENCE_AGENT_ENVS_ROOT` for Docker), then the pre-rename `data/` and
 * `services/gateway/.venv` layouts, and last the `python` already on PATH that
 * this function used to return unchecked. When nothing is runnable the
 * resolver fails fast instead of returning a bare `python` that only surfaces
 * as `spawn python ENOENT` inside the model's tool error.
 */
export declare function resolveMcpPython(env?: NodeJS.ProcessEnv, dataDir?: string): string;
/** Only the bundled provider envelope supplies endpoint attribution. Legacy text
 * remains classifiable as 429, but cannot trip endpoint-wide 406 suppression. */
export declare function sourceHttpFailure(message: string): (NonNullable<McpAttempt["upstream"]> & {
    retryAfterMs?: number;
}) | undefined;
export interface McpNodeClientOptions {
    /** Data dir the API resolved; the provisioned gateway venv lives under `<dataDir>/envs`. */
    dataDir?: string;
    /** Interpreter lookup override (tests, or an embedder with its own layout). */
    resolvePython?: (env: NodeJS.ProcessEnv, dataDir?: string) => string;
}
export declare class McpNodeClient {
    private readonly loadConfig;
    private readonly oauth?;
    private readonly logger;
    private readonly options;
    private readonly sessions;
    private readonly connecting;
    private proxies;
    constructor(loadConfig?: () => ExtensionsConfigFile, oauth?: McpOAuthManager | undefined, logger?: OperationalLogger, options?: McpNodeClientOptions);
    private resolvePython;
    sourceScope(serverId: string): string;
    private currentConfig;
    private proxySignature;
    private closeAll;
    private closeSession;
    private session;
    private connectSession;
    private serverTools;
    catalog(_signal?: AbortSignal, proxies?: Record<string, ResolvedProxy>): Promise<McpCatalog>;
    reload(proxies?: Record<string, ResolvedProxy>): Promise<McpCatalog>;
    invoke(request: McpInvokeRequest, signal?: AbortSignal, onProgress?: (chunk: string) => void): Promise<McpInvokeResponse>;
    /** Close every cached session (shutdown hook). */
    close(): Promise<void>;
}
