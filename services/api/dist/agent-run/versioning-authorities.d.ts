import { type ObjectRef, type Pool } from "@sciencediscovery/cas";
import type { SessionStore } from "../store.js";
/** Native task ownership, independent of which executor runs the Agent. */
export interface AgentAuthorityScope {
    sessionId: string;
    executionId: string;
    /** Absent for the session's main Agent; native tasks currently form one level. */
    subagentId?: string;
}
/** Capture shared resources and only this Agent's execution authorities. */
export declare function versioningAuthorities(store: SessionStore, scope: AgentAuthorityScope): () => Promise<{
    scope: {
        sessionId: string;
        executionId: string;
        /** Absent for the session's main Agent; native tasks currently form one level. */
        subagentId?: string;
        agentId: string;
    };
    session: {
        id: string;
        projectId: string;
    } | null;
    permission: import("@sciencediscovery/schema").PermissionEpoch | null;
    artifacts: {
        createdAt: string;
        createdInSessionId: string;
        createdInSessionTitle: string;
        currentVersion: number;
        deletedAt?: string;
        description?: string;
        id: string;
        kind: import("@sciencediscovery/schema").ScientificArtifactKind;
        logicalName: string;
        name: string;
        origin: import("@sciencediscovery/schema").ArtifactOrigin;
        originMeta?: import("@sciencediscovery/schema").ArtifactOriginMeta;
        projectId: string;
        sessionId: string;
        title?: string;
        updatedAt: string;
        versions: {
            baseVersionId?: string;
            publicationId?: string;
            artifactId: string;
            createdAt: string;
            executionRunIds: string[];
            id: string;
            inputArtifactVersionIds: string[];
            mediaType: string;
            projectId: string;
            references?: import("@sciencediscovery/schema").ComposerReference[];
            sessionId: string;
            sourcePath?: string;
            turnId?: string;
            version: number;
            content: ObjectRef<Pool>;
        }[];
    }[];
    environments: import("@sciencediscovery/schema").Environment[];
    environmentRevisions: import("@sciencediscovery/schema").EnvironmentRevision[];
    children: {
        id: string;
        parentTurnId: string;
        status: "cancelled" | "completed" | "failed" | "running" | "timed_out";
        record: import("@sciencediscovery/cas").AgentStateRef;
    }[];
    task: {
        id: string;
        parentTurnId: string;
        status: "cancelled" | "completed" | "failed" | "running" | "timed_out";
        record: import("@sciencediscovery/cas").AgentStateRef;
    } | null | undefined;
    notifications: unknown;
    transfers: import("@sciencediscovery/schema").WorkspaceTransfer[];
    shellExecutions: (Omit<import("@sciencediscovery/schema").AgentShellExecution, "result"> & {
        resultRef?: import("@sciencediscovery/cas").AgentStateRef;
        historical?: boolean;
        candidateResultRef?: import("@sciencediscovery/cas").AgentStateRef;
        candidateFailure?: {
            state: "failed" | "cancelled";
            finishedAt: string;
            startedAt?: string;
            error?: string;
        };
        originalExecutionContext?: import("@sciencediscovery/provenance").ShellExecutionContext;
        expectedRunnerInstanceId?: string;
        catalogRevision?: number;
        submissionDigest?: string;
    })[];
    reviews: import("@sciencediscovery/schema").ReviewRun[];
    artifactReviews: import("@sciencediscovery/schema").ArtifactReviewRun[];
    executions: {
        resultDigest?: string;
        accelerator?: Record<string, unknown> | null;
        cgroupMode: "none" | "direct-v2" | "systemd-system" | "systemd-user" | "unavailable";
        createdFiles: string[];
        environmentRevisionId: string | null;
        exitCode: number | null;
        finishedAt: string;
        id: string;
        kernelId: string;
        kernelMode: import("@sciencediscovery/schema").KernelMode | null;
        language: import("@sciencediscovery/schema").ExecutionLanguage | null;
        modifiedFiles: string[];
        networkPolicy: import("@sciencediscovery/schema").SandboxNetworkMode | "host";
        networkAccessRevision?: string;
        permissionEpochId: string;
        remoteHostAlias?: string;
        runnerId?: string;
        resourceProfile?: Record<string, unknown>;
        runnerVersion: string;
        sandbox: import("@sciencediscovery/schema").SandboxKind | "none" | "unavailable";
        directAuthorization?: import("@sciencediscovery/schema").DirectExecutionAuthorization;
        sessionId: string;
        startedAt: string;
        status: "cancelled" | "failed" | "succeeded" | "unconfirmed";
        tool: "run_python" | "run_r" | "run_shell" | "run_direct_shell";
        toolCallId?: string;
        toolVersion: string;
        turnId: string;
        workingDirectory: string;
        code: ObjectRef<Pool>;
        stdout: ObjectRef<Pool>;
        stderr: ObjectRef<Pool>;
        envSnapshot: ObjectRef<Pool> | null;
    }[];
}>;
