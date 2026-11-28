// Copyright (C) 2026-2026 Huawei Technologies Co., Ltd
// Licensed under the Apache License, Version 2.0 (the "License");
import { CasStore } from "@sciencediscovery/cas";
import { annotateReviewStaleness } from "../reviewer-specialist/review-staleness.js";
/** Capture shared resources and only this Agent's execution authorities. */
export function versioningAuthorities(store, scope) {
    const { sessionId, executionId, subagentId } = scope;
    const agentId = subagentId === undefined ? "main" : `subagent:${subagentId}`;
    const legacy = new CasStore(store.dataDir);
    const retained = new Map();
    const retain = (ref, pool = "agent-state") => {
        const key = `${pool}:${ref.hash}:${ref.size}`;
        let saved = retained.get(key);
        if (!saved) {
            saved = legacy.retain(ref, pool);
            retained.set(key, saved);
        }
        return saved;
    };
    return async () => {
        const session = store.getSession(sessionId);
        const executions = await Promise.all((await store.listExecutionRuns(sessionId))
            .filter((execution) => execution.turnId === executionId).map(async (execution) => ({
            ...execution,
            code: await retain(execution.code), stdout: await retain(execution.stdout), stderr: await retain(execution.stderr),
            envSnapshot: execution.envSnapshot ? await retain(execution.envSnapshot) : null,
        })));
        const subagents = await store.captureSubagentAuthorities(sessionId, subagentId);
        return {
            scope: { ...scope, agentId },
            session: session ? { id: session.id, projectId: session.projectId } : null,
            permission: store.getSessionPermissionEpoch(sessionId) ?? null,
            artifacts: await Promise.all(store.listArtifacts(sessionId).map(async (artifact) => ({
                ...artifact, versions: await Promise.all(store.listArtifactVersions(sessionId, artifact.id).map(async (version) => ({
                    ...version, content: await retain(version.content, "data"),
                }))),
            }))),
            environments: store.listEnvironments(),
            environmentRevisions: store.listEnvironmentRevisions(),
            // The native parent owns the task catalog. A child records its own task,
            // never the session-wide sibling catalog. Full records remain auditable.
            children: subagentId === undefined ? subagents : [],
            task: subagentId === undefined ? null : subagents[0],
            notifications: store.notifications.snapshot(sessionId, agentId),
            transfers: store.transfers.snapshot(sessionId, agentId),
            shellExecutions: store.shellExecutions.snapshot(sessionId, agentId),
            reviews: await store.listReviews(sessionId),
            // The main Agent acts on this snapshot, so it needs the same stale marker as the
            // Web UI: a review that a newer version superseded must not read as current.
            artifactReviews: annotateReviewStaleness(store, sessionId, await store.listArtifactReviews(sessionId)),
            executions,
        };
    };
}
