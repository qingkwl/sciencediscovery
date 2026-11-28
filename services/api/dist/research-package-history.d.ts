import type { ObjectRef } from "@sciencediscovery/cas";
import type { MemoryGraphSnapshot } from "@sciencediscovery/memory";
import type { AgentShellExecution, ArtifactDerivation, ChatMessage, ComposerReference, Claim, EvidenceItem, EvidenceLink, ExecutionRun, PromptManifest, Subagent, WorkspaceFileProvenance } from "@sciencediscovery/schema";
import type { SessionStore } from "./store.js";
export interface PackageHistory {
    executionRuns?: ExecutionRun[];
    promptManifests?: PromptManifest[];
    artifactDerivations?: ArtifactDerivation[];
    subagents?: Subagent[];
    shellExecutions?: AgentShellExecution[];
    claims?: Claim[];
    evidenceLinks?: EvidenceLink[];
    evidenceItems?: EvidenceItem[];
}
/** One namespace per import, shared by store records and graph routing keys. */
export declare class ResearchPackageIds {
    readonly values: Map<string, string>;
    id(source: string): string;
    optional(source: string | null | undefined): string | undefined;
}
export declare function exportHistory(store: SessionStore, sessionId: string): Promise<PackageHistory>;
/** Only actual CAS references, not arbitrary hashes of settings or package specs. */
export declare function casHashes(value: unknown, visited?: WeakSet<object>): string[];
export declare function versionRefs(value: unknown, visited?: WeakSet<object>): ObjectRef[];
export declare function remapRunStreamId(streamId: string, ids: ResearchPackageIds): string;
/** Rewrite structured routing keys while leaving paths and textual evidence intact. */
export declare function remapRunEvent<T>(value: T, ids: ResearchPackageIds): T;
/** Map structured references only. Prose, URLs, paths and CAS hashes remain byte exact. */
export declare function remapReferences(references: ComposerReference[] | undefined, ids: ResearchPackageIds, projectId: string): ComposerReference[] | undefined;
export declare function remapMessages(messages: ChatMessage[], ids: ResearchPackageIds, projectId: string): ChatMessage[];
export declare function restoreHistory(store: SessionStore, sessionId: string, source: PackageHistory, ids: ResearchPackageIds): Promise<void>;
export declare function restoreEvidenceItems(store: SessionStore, sessionId: string, source: PackageHistory, ids: ResearchPackageIds): Promise<void>;
export declare function remapWorkspaceProvenance(source: WorkspaceFileProvenance, sessionId: string, projectId: string, ids: ResearchPackageIds, versionIds: Map<string, string>): WorkspaceFileProvenance;
export declare function remapMemorySnapshot(snapshot: MemoryGraphSnapshot, sessionIds: Map<string, string>, projectId: string, ids: ResearchPackageIds, artifactIds: Map<string, string>): MemoryGraphSnapshot;
