import { type BootstrapTokenSource } from "../http/bootstrap-tokens.js";
import { type WorkspaceUploadLimits } from "../workspace-upload.js";
export interface ServerConfig {
    authToken: string;
    /** How `authToken` was obtained; startup output only echoes a managed token. */
    authTokenSource?: BootstrapTokenSource;
    /** Account service used to verify the bearer on the loopback token route.
     *  Empty means the route fails closed instead of handing out the token. */
    accountsBaseUrl?: string;
    dataDir: string;
    host: string;
    /** Model catalog snapshot written at packaging time. It is the offline
     *  fallback for a first start that has never refreshed the catalog, so a
     *  Docker image or release binary is useful without network. */
    modelCatalogPath: string;
    paperPythonPath: string;
    paperWorkerPath: string;
    /**
     * [D3 P2-2] Frozen rail: when a sd-services onedir exists, the paper
     * worker spawns as `<exe> paper <pdf> <out>` (the dispatcher's paper
     * entry runs the loose-file worker). Undefined keeps the venv rail
     * (`pythonPath + workerPath`), which P3-3 retires after P4's window.
     */
    paperFrozenCommand?: {
        exe: string;
        args: string[];
    };
    port: number;
    /**
     * The port users open when another process owns the public one (the JiuwenSwarm adapter sits in front of
     * this API and moves it to port + 100). Only the sign-in link uses it; absent, it is `port`.
     */
    publicPort?: number;
    runnerToken: string;
    runnerUrl: string;
    sshConfigPath: string;
    staticDir: string;
    /**
     * Agent-loop timeouts. The `gateway` prefix is the settled name of the
     * environment variables and persisted settings, kept for compatibility; the
     * loop they bound runs inside this process.
     */
    /** Maximum time without model-stream progress before the run is stalled. */
    gatewayIdleTimeoutMs: number;
    /** Hard upper bound for a complete agent turn. */
    gatewayTurnTimeoutMs: number;
    /** Initial Runner execution timeout; persisted settings override after first load. */
    runnerExecTimeoutMs: number;
    /** Initial persistent-kernel idle timeout. */
    kernelIdleTimeoutMs: number;
    /** Initial permission-decision wait timeout. */
    permissionWaitTimeoutMs: number;
    /** Initial runner workspace total quota; persisted settings override after first load. */
    runnerMaxWorkspaceBytes: number;
    /** Initial runner output retain budget; persisted settings override after first load. */
    runnerMaxOutputBytes: number;
    /** URL the gateway's proxy tools call back into to run Node tool handlers. */
    /** Multipart upload and Session workspace quotas. */
    workspaceUpload: WorkspaceUploadLimits;
    /**
     * Seed one finished Session into a data directory that has no conversation
     * of its own, so a first install opens on something to read rather than an
     * empty sidebar. `loadServerConfig` turns this on unless
     * `SCIENCE_AGENT_SAMPLE_SESSION` says otherwise; absent means off, which is
     * what a config built by hand — every test config — wants.
     */
    sampleSession?: boolean;
    usageExchangeRates?: {
        enabled: boolean;
        sourceUrl: string;
        timeoutMs: number;
        ttlMs: number;
    };
    /** Memory-graph sidecar (services/memory-graph, Python FastAPI, loopback).
     *  The on/off switch lives in the store (System Settings → Memory graph),
     *  not in env, so there is no `enabled` here. `neo4jPassword` is read from
     *  `.env` only as a one-time first-boot seed for the encrypted store; the
     *  runtime reads the store (set via the UI). */
    memoryGraph: {
        url: string;
        internalToken: string;
        neo4jPassword?: string;
        /** False where this deployment runs no memory-graph sidecar (the Docker image): a new data directory then
         *  starts with the graph off instead of on and degraded. Only seeds a new directory, like the defaults.
         *  Absent means available. */
        available?: boolean;
    };
    /** Evolve search sidecar (services/evolve, Python FastAPI, loopback). It
     *  holds no business state and never receives a model key, so there is
     *  nothing here but where to reach it and the shared loopback token. */
    evolve: {
        url: string;
        internalToken: string;
        controlUrl?: string;
        controlToken?: string;
        /** Whether candidates may execute without an isolation backend.
         *
         *  False everywhere a real sandbox exists. The Windows desktop sets it
         *  because bubblewrap and Seatbelt have no Windows equivalent; even then a
         *  run only proceeds when its goal carries the user's confirmation, and
         *  pre-flight refuses one that does not. Never a default: a server that
         *  forgot the variable must not quietly run model-written code unconfined.
         *  Absent means false; the loader always writes it. */
        unisolated?: boolean;
    };
}
export declare const repositoryRoot: string;
export declare function loadServerConfig(env?: NodeJS.ProcessEnv): ServerConfig;
