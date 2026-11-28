import type { ArtifactVersionDiff, ArtifactVersionProvenance, ConnectorManifest, WorkspaceFile, WorkspaceFileProvenance } from "@sciencediscovery/schema";
import { MemoryGraphClient } from "@sciencediscovery/memory";
import { ProvenanceRecorder } from "@sciencediscovery/provenance";
import { SessionStore } from "../store.js";
export declare function classifyWorkspaceFilePreview(path: string): WorkspaceFile["previewKind"];
export declare function listWorkspaceFiles(store: SessionStore, sessionId: string, complete?: boolean, options?: {
    onMutation?: () => void;
}): Promise<WorkspaceFile[]>;
export declare function workspaceFileProvenance(store: SessionStore, sessionId: string, pathInput: string): Promise<WorkspaceFileProvenance>;
export declare function artifactVersionProvenance(store: SessionStore, recorder: ProvenanceRecorder, memoryGraphClient: MemoryGraphClient | null, sessionId: string, versionId: string): Promise<ArtifactVersionProvenance>;
export declare function artifactVersionDiff(store: SessionStore, recorder: ProvenanceRecorder, sessionId: string, toVersionId: string, fromVersionId?: string): Promise<ArtifactVersionDiff>;
export declare function aggregateToolText(result: unknown): string | undefined;
export declare function mcpConnectorManifest(manifest: import("@sciencediscovery/schema").McpSourceManifest): ConnectorManifest;
export declare function toolSummary(result: unknown): string | undefined;
