import { ExecutionRouter } from "@sciencediscovery/execution-router";
import { McpSourceCatalog, type McpTransportClient } from "@sciencediscovery/data-source";
import { RemoteComputeClient } from "@sciencediscovery/executor";
import { type IdeaTreePersistence } from "@sciencediscovery/idea-tree";
import { CustomMcpServers } from "../mcp/custom-servers.js";
import type { EvolveGoal, ModelsDevPayload, ResolvedProxy } from "@sciencediscovery/schema";
import { MemoryGraphClient, MemoryGraphSink } from "@sciencediscovery/memory";
import { GovernedDownloadManager } from "@sciencediscovery/artifact-manager";
import { McpGovernanceBroker } from "@sciencediscovery/data-source";
import { PaperService } from "../papers.js";
import { PermissionDecisionQueue } from "@sciencediscovery/governance";
import { ProvenanceRecorder } from "@sciencediscovery/provenance";
import { RunnerClient } from "@sciencediscovery/executor";
import { CandidateSources } from "../evolution/candidates.js";
import { RunTokenRegistry } from "../evolution/llm-proxy.js";
import { EvolveOrchestrator } from "../evolution/orchestrator.js";
import { EvolveAvailability } from "../evolution/availability.js";
import { EvolutionStore } from "../evolution/store.js";
import type { EvolveRuntimeFactory } from "../runs/index.js";
import type { SkillLibraryCatalog } from "../skill-library-catalog.js";
import { SkillCatalog } from "@sciencediscovery/specialist";
import { SessionStore } from "../store.js";
import { NativeWebProviderClient, WebBroker } from "@sciencediscovery/data-source";
import type { ServerConfig } from "./config.js";
import type { PackageCapacity } from "../research-package-preflight.js";
export interface ApiServerDependencies {
    /** Embedding/test seam: exercise governed Web tools without contacting a live search engine. */
    webProvider?: NativeWebProviderClient;
    disabledConnectorPlugins?: readonly string[];
    connectorFetch?: typeof fetch;
    /** Test seam: resolve the model catalog from a fixture instead of models.dev. */
    fetchModelCatalog?: (options: {
        proxy?: ResolvedProxy;
        url: string;
    }) => Promise<ModelsDevPayload>;
    /** Test seam: resolve usage display exchange rates without touching the network. */
    fetchUsageExchangeRate?: typeof fetch;
    /** Test/embedding seam. Production uses the Python tree service. */
    ideaTreeRepository?: (scope: {
        projectId: string;
        sessionId: string;
    }) => IdeaTreePersistence;
    /** Test seam: drive MCP through a stub transport instead of live servers. */
    mcpTransport?: McpTransportClient;
    /** Test seam: exercise remote-host HTTP flows without connecting to a real SSH machine. */
    remoteCompute?: RemoteComputeClient;
    /** Test seam: keep package HTTP tests independent of the host volume's free space.
     *  A case can also swap it to prove which routes charge disk and which only write
     *  the response. */
    measureResearchPackageCapacity?: (dataDir: string) => Promise<PackageCapacity>;
}
/** How much of the winning candidate `get_evolve_run` inlines. A long program is
 *  read in full from its artifact; this bounds what one tool result can cost. */
export declare const BEST_SOURCE_LIMIT = 30000;
/**
 * What a run's result artifact is called: `evolve/<run>/<entrypoint>`.
 *
 * Scoped by run, after the unscoped version was measured doing the wrong
 * thing. An earlier revision used the bare entrypoint on the reasoning that
 * two runs over the same file are the same logical artifact — but for a
 * scripted search the entrypoint is always the literal `candidate.py`, so a
 * compression run, a peak-detection run and an enzyme-kinetics run in one
 * project piled into a single artifact ten versions deep, interleaved with
 * versions the sessions' own agents had declared under that name. Version 10
 * being a Michaelis-Menten fitter "derived from" version 8's peak detector is
 * lineage said backwards.
 *
 * One run, one artifact, exactly two versions: v1 the seed, v2 the winner.
 */
export declare function evolveArtifactName(run: {
    goal: EvolveGoal;
    id: string;
}): string;
/**
 * The API composition root. It selects concrete adapters and wires domain
 * components, while the HTTP layer is limited to protocol translation.
 */
export declare function createPlatformServices(config: ServerConfig, repositoryRoot: string, dependencies?: ApiServerDependencies): {
    connectorPlugins: Promise<import("@sciencediscovery/plugin-sdk").PluginScope<import("@sciencediscovery/mcp-sources/plugin").ConnectorContribution>>;
    artifactManager: GovernedDownloadManager;
    customMcpServers: CustomMcpServers;
    evolutionStore: EvolutionStore;
    evolveAvailability: EvolveAvailability;
    evolveCandidates: CandidateSources;
    evolveOrchestrator: EvolveOrchestrator;
    evolveRunTokens: RunTokenRegistry;
    evolveRuntimeFactory: EvolveRuntimeFactory;
    executionRouter: ExecutionRouter;
    ideaResearch: {
        command: (sessionId: string, operation: string, input?: Record<string, unknown>) => Promise<any>;
        cleanup: (projectId: string, sessionId: string) => Promise<void>;
        events: (sessionId: string, researchId: string, signal: AbortSignal) => Promise<import("node:stream/web").ReadableStream<Uint8Array<ArrayBufferLike>>>;
        summary: (sessionId: string, researchId?: string) => Promise<{
            message: string;
        } | {
            activities?: import("@sciencediscovery/schema").IdeaResearchActivity[];
            id: string;
            status: "running" | "pausing" | "paused" | "interrupted" | "completed" | "ended" | "budget_exhausted";
            objective: string;
            phase: string;
            round: number;
            batch: string[];
            batchCompleted: number;
            tokens: number;
            usageKnown: boolean;
            unreportedBudgetEstimate?: number;
            reason: string | null;
            modelId: string;
            currentNodeId: string | null;
            settings: import("@sciencediscovery/schema").IdeaResearchSettings;
            template?: import("@sciencediscovery/schema").IdeaResearchTemplate;
            message?: undefined;
            candidates: {
                id: string;
                hypothesis: string;
                status: "done" | "failed" | "needs_retry" | "pending" | "running";
                score: number | null;
                insight: string | null;
            }[];
            insight: string | null | undefined;
        }>;
        close(): void;
    };
    ideaTreeAuthorities: import("@sciencediscovery/idea-tree").IdeaTreeAuthorityRegistry;
    ideaTreeRepository: (sessionId: string) => IdeaTreePersistence;
    mcpBroker: McpGovernanceBroker;
    mcpCatalog: McpSourceCatalog;
    mcpGateway: McpTransportClient;
    mcpRegistry: import("@sciencediscovery/mcp-sources").McpSourceRegistry;
    memoryGraphClient: MemoryGraphClient;
    memoryGraphEnabled: () => boolean;
    memoryGraphSink: MemoryGraphSink;
    paperService: PaperService;
    permissionDecisions: PermissionDecisionQueue;
    provenanceRecorder: ProvenanceRecorder;
    remoteCompute: RemoteComputeClient;
    runnerClient: RunnerClient;
    skillCatalog: SkillCatalog;
    store: SessionStore;
    webBroker: WebBroker;
};
export type PlatformServices = ReturnType<typeof createPlatformServices>;
/** Restore durable work and make the composed platform ready for requests. */
export declare function initializePlatformServices(services: PlatformServices, config: ServerConfig, skillLibraryCatalog: SkillLibraryCatalog): Promise<void>;
