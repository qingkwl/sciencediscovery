import type { DatabaseSync } from "node:sqlite";
import { PluginBridge, type BridgeScope } from "@sciencediscovery/plugin-sdk";
import type { RuntimeSettingsOverrides, RuntimeSettingsDetails, SessionRun } from "@sciencediscovery/schema";
import type { SessionStore } from "../store.js";
import { installedPlugins } from "./catalog.js";
import { type AgentStateRef } from "@sciencediscovery/cas";
type Ports = Pick<SessionStore, "getProject" | "getSession" | "getProjectSettings" | "getSessionSettings" | "dataDir" | "replaceProjectSettings" | "replaceSessionSettings" | "createSession" | "deleteSession" | "commitPluginSettings" | "getSessionRun" | "listRunStreamEventsOfType">;
interface Composition {
    projectId: string;
    revision: string;
    settings: RuntimeSettingsDetails;
    plugins: typeof installedPlugins;
}
interface Candidate {
    id: string;
    projectId: string;
    baseline: Composition;
    patch: RuntimeSettingsOverrides;
    baselineRef: AgentStateRef;
    proposedRef: AgentStateRef;
    comparisonRef?: AgentStateRef;
    pinnedBaseline: RuntimeSettingsOverrides;
    pinnedProposed: RuntimeSettingsOverrides;
    baselineAssets: unknown;
    proposedAssets: unknown;
    status: "candidate" | "prepared" | "compared" | "approved" | "rejected" | "applied";
    experiments?: {
        baselineSessionId: string;
        candidateSessionId: string;
        baselineSettings: RuntimeSettingsOverrides;
        candidateSettings: RuntimeSettingsOverrides;
    };
    comparison?: {
        baseline: SessionRun;
        candidate: SessionRun;
        capturedAt: string;
        fidelity: "observed-runs";
    };
    approvedAt?: string;
    appliedRevision?: string;
}
/** Host control plane. Credentials, execution permissions and domain stores remain elsewhere. */
export declare class PluginControl {
    private readonly db;
    private readonly ports;
    private readonly normalize;
    private readonly listeners;
    private readonly queues;
    private assetPort?;
    bindAssets(port: NonNullable<PluginControl["assetPort"]>): void;
    private pin;
    constructor(db: DatabaseSync, ports: Ports, normalize: (value: unknown) => RuntimeSettingsOverrides);
    private serial;
    assertScope(scope: BridgeScope): void;
    snapshot(scope: BridgeScope): Composition;
    describe(scope: BridgeScope): {
        projectId: string;
        revision: string;
        settings: RuntimeSettingsDetails;
        plugins: typeof installedPlugins;
        status: import("@sciencediscovery/plugin-sdk").PluginStatus[];
        applies: "nextRun";
    };
    subscribe(scope: BridgeScope, listener: () => void): () => void;
    changed(projectId?: string, sessionId?: string): void;
    bridge(scope: BridgeScope): PluginBridge;
    list(projectId: string): Candidate[];
    private save;
    create(projectId: string, expectedRevision: unknown, value: unknown): Promise<Candidate>;
    command(projectId: string, id: string, action: string, input: unknown): Promise<Candidate>;
}
export {};
