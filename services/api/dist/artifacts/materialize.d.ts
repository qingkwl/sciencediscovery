import type { SessionStore } from "../store.js";
/** Project-scoped immutable input -> the caller's local execution workspace. */
export declare function materializeArtifact(store: SessionStore, input: {
    sessionId: string;
    workspaceRoot: string;
    sourcePathPrefix?: string;
    subagentId?: string;
    artifactId: string;
    version: number;
    path: string;
    signal?: AbortSignal;
}): Promise<{
    artifact_id: string;
    version: number;
    version_id: string;
    path: string;
    sha256: string;
    size: number;
}>;
