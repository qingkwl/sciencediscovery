import type { ConfigurationChoiceOptionView, RuntimeSettingsOverrides, SessionRun } from "@sciencediscovery/schema";
import type { SessionStore } from "../store.js";
import type { ConfigurationAdapterContext, ConfigurationApplyResult, ConfigurationRecord } from "./types.js";
interface NativeRunContext {
    sessionId: string;
    runId: string;
    stopGeneration: number;
    enabledConnectorIds: string[];
    webSearchAvailable: boolean;
    webSettingsRevision?: string;
    toolCatalogFingerprint: string;
    checkpoint?: {
        requestId: string;
        historyRef: unknown;
        committedAt: string;
    };
    plugins?: RuntimeSettingsOverrides["plugins"];
    executionDependencies?: Record<string, string>;
}
export interface NativeRunOverlay {
    sessionId: string;
    runId: string;
    requestId: string;
    revision: number;
    optionId: string;
    previewDigest: string;
    stopGeneration: number;
    connectorId: string;
    checkpoint: NonNullable<NativeRunContext["checkpoint"]>;
    resourceVersions: Record<string, string>;
    createdAt: string;
}
/** Evidence from the actual factory, distinct from configured or approved IDs. */
export declare function nativeRuntimeConnectorIds(store: SessionStore, sessionId: string, runId: string): string[] | undefined;
/** Persist evidence from the actual executable Native factory, never from Agent-supplied tool names. */
export declare function recordNativeRunChoiceContext(input: {
    store: SessionStore;
    sessionId: string;
    runId: string;
    enabledConnectorIds: readonly string[];
    webSearchAvailable: boolean;
    toolCatalogFingerprint: string;
    plugins?: RuntimeSettingsOverrides["plugins"];
}): void;
/** Approving a delta cannot silently reapprove changed original tools. */
export declare function nativeExecutionDependencies(store: SessionStore, record: ConfigurationRecord): Record<string, string> | undefined;
export declare function nativeExecutionDependenciesCurrent(store: SessionStore, record: ConfigurationRecord, receipt: {
    resourceVersions: Record<string, string>;
    executionDependencies?: Record<string, string>;
}): boolean;
/** Called only after the durable model checkpoint and its original run binding were committed. */
export declare function recordNativeChoiceCheckpoint(input: {
    store: SessionStore;
    sessionId: string;
    runId: string;
    requestId: string;
    stopGeneration: number;
    historyRef: unknown;
    committedAt: string;
}): void;
export declare function nativeConnectorChoiceOptions(input: {
    store: SessionStore;
    sessionId: string;
    runId?: string;
    ready: boolean;
}): ConfigurationChoiceOptionView[];
/** Validate the explicit choice supplied by the current decision operation. */
export declare function validateNativeChoice(store: SessionStore, record: ConfigurationRecord, option: ConfigurationChoiceOptionView | undefined): void;
/** Read-only recovery validates the persisted decision; it never authorizes another apply. */
export declare function validatePersistedNativeChoice(store: SessionStore, record: ConfigurationRecord): void;
/** Runs inside the same transaction as the decision receipt. No formal configuration setter is called. */
export declare function applyNativeRunOverlay(store: SessionStore, record: ConfigurationRecord, adapterContext: ConfigurationAdapterContext): ConfigurationApplyResult;
export declare function nativeRunOverlay(store: SessionStore, sessionId: string, runId: string, requestId: string): NativeRunOverlay | undefined;
/** Adds only individually approved, witnessed increments; the historical settingsSnapshot remains unchanged. */
export declare function nativeApprovedRunConnectorIds(store: SessionStore, run: SessionRun): string[];
export declare function nativeConfigurationChoiceRecord(store: SessionStore, sessionId: string, requestId: string): ConfigurationRecord | undefined;
export {};
