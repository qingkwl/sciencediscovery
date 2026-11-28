import { type PluginSettingsMap, type PluginDefinition } from "@sciencediscovery/plugin-sdk";
import type { RuntimeContribution } from "@sciencediscovery/plugin-sdk/runtime";
import type { WorkspaceAgentOptions } from "@sciencediscovery/workspace";
import type { PlanStore } from "@sciencediscovery/plan";
import { type EvolveToolRuntime } from "@sciencediscovery/evolve";
import type { AgentScope, DurableContextStore } from "@sciencediscovery/context";
import type { RuntimeMessage } from "@sciencediscovery/runtime-core";
/** Build-time installation. Providers receive only their own domain ports. */
export declare function runtimePluginDefinitions<M extends RuntimeMessage>(options: {
    scope: AgentScope;
    workspace: WorkspaceAgentOptions;
    durable: DurableContextStore;
    planStore?: PlanStore;
    evolve?: EvolveToolRuntime;
}): PluginDefinition<RuntimeContribution<M>>[];
export declare function createRuntimePluginScope<M extends RuntimeMessage>(options: Parameters<typeof runtimePluginDefinitions<M>>[0], disabled?: readonly string[], settings?: PluginSettingsMap): Promise<{
    readonly manifests: readonly import("@sciencediscovery/plugin-sdk").PluginManifest[];
    readonly status: {
        id: string;
        installed: true;
        available: boolean;
        enabled: boolean;
        authorized: boolean;
        diagnostics: import("@sciencediscovery/plugin-sdk").PluginDiagnostic[];
        active: boolean;
    }[];
    contributions: readonly RuntimeContribution<M>[];
    start(signal: AbortSignal): Promise<void>;
    dispose(): Promise<void>;
}>;
