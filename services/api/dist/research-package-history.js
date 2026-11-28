// Copyright (C) 2026-2026 Huawei Technologies Co., Ltd
// Licensed under the Apache License, Version 2.0 (the "License");
import { randomUUID } from "node:crypto";
/** One namespace per import, shared by store records and graph routing keys. */
export class ResearchPackageIds {
    values = new Map();
    id(source) {
        let target = this.values.get(source);
        if (!target) {
            const child = source.match(/^subtask:subagent:([^:]+):exec:(.+)$/);
            const scope = source.match(/^(subtask:subagent:|subagent:|subtask:mcp:|subtask:|goal:session:)(.+)$/);
            const file = source.match(/^source_file:session:([^:]+):(.*)$/);
            target = child ? `subtask:subagent:${this.id(child[1])}:exec:${this.id(child[2])}`
                : scope ? `${scope[1]}${this.id(scope[2])}`
                    : file ? `source_file:session:${this.id(file[1])}:${file[2]}` : randomUUID();
            this.values.set(source, target);
        }
        return target;
    }
    optional(source) {
        return source ? this.id(source) : undefined;
    }
}
export async function exportHistory(store, sessionId) {
    return {
        executionRuns: await store.listExecutionRuns(sessionId),
        promptManifests: await store.listPromptManifests(sessionId),
        artifactDerivations: await store.listArtifactDerivations(sessionId),
        subagents: store.listSubagents(sessionId).map(({ handoff: _handoff, contextRef: _context, runtimeSessionId: _runtime, runtimeInput: _input, runtimeOptions: _options, ...child }) => child),
        shellExecutions: await Promise.all(store.shellExecutions.snapshot(sessionId).map((row) => store.shellExecutions.get(row.id, row))),
        claims: await store.listClaims(sessionId), evidenceLinks: await store.listEvidenceLinks(sessionId), evidenceItems: await store.listEvidenceItems(sessionId),
    };
}
/** Only actual CAS references, not arbitrary hashes of settings or package specs. */
export function casHashes(value, visited = new WeakSet()) {
    const hashes = new Set();
    const visit = (item) => {
        if (!item || typeof item !== "object")
            return;
        if (visited.has(item))
            return;
        visited.add(item);
        const record = item;
        if (typeof record.hash === "string" && typeof record.size === "number")
            hashes.add(record.hash);
        for (const [key, child] of Object.entries(record)) {
            if (/^(content|code|stdout|stderr|env)_hash$/.test(key) && typeof child === "string" && /^[a-f0-9]{64}$/.test(child))
                hashes.add(child);
            else
                visit(child);
        }
    };
    visit(value);
    return [...hashes];
}
export function versionRefs(value, visited = new WeakSet()) {
    const refs = new Map();
    const visit = (item) => {
        if (!item || typeof item !== "object")
            return;
        if (visited.has(item))
            return;
        visited.add(item);
        const row = item;
        if ((row.pool === "data" || row.pool === "agent-state") && typeof row.digest === "string" && /^sha256:[a-f0-9]{64}$/.test(row.digest)
            && typeof row.size === "number" && typeof row.mediaType === "string" && !row.runnerId) {
            const ref = row;
            refs.set(`${ref.pool}:${ref.digest}`, ref);
        }
        for (const child of Object.values(row))
            visit(child);
    };
    visit(value);
    return [...refs.values()];
}
export function remapRunStreamId(streamId, ids) {
    if (streamId === "main")
        return streamId;
    for (const prefix of ["subagent-", "tool-"]) {
        if (streamId.startsWith(prefix))
            return `${prefix}${ids.id(streamId.slice(prefix.length))}`;
    }
    return ids.id(streamId);
}
/** Rewrite structured routing keys while leaving paths and textual evidence intact. */
export function remapRunEvent(value, ids) {
    const routing = new Set(["sessionId", "runId", "turnId", "parentTurnId", "parentRunId", "subagentId", "toolCallId", "executionId", "executionRunId", "workspaceId", "artifactId", "artifactVersionId", "environmentRevisionId", "messageId", "userMessageId", "assistantMessageId", "checkpointMessageId", "retryOfRunId", "wakeAfterRunId", "promptManifestId", "reviewRunId", "claimId", "evidenceItemId"]);
    for (const key of ["taskId", "checkpointId", "supersededBy", "reusedFromReviewId", "invocationId", "connectorInvocationId", "remoteJobId", "fileId", "parentRevisionId", "currentRevisionId", "projectId", "attachedMessageId"])
        routing.add(key);
    const identityArrays = new Set(["annotationIds", "executionRunIds", "inputArtifactVersionIds", "artifactVersionIds", "reviewIds"]);
    const visit = (item, context = "") => {
        if (Array.isArray(item))
            return item.map((child) => typeof child === "string" && identityArrays.has(context) ? ids.id(child) : visit(child, context));
        if (!item || typeof item !== "object")
            return item;
        if (context === "references") {
            const reference = item;
            return { ...reference, id: ["skill", "dbrecord"].includes(reference.kind) ? reference.id : ids.id(reference.id),
                ...(reference.sessionId ? { sessionId: ids.id(reference.sessionId) } : {}),
                ...(reference.projectId ? { projectId: ids.id(reference.projectId) } : {}) };
        }
        return Object.fromEntries(Object.entries(item).map(([key, child]) => [key,
            typeof child === "string" && key === "outputStream" ? remapRunStreamId(child, ids)
                : typeof child === "string" && (routing.has(key) || key === "id" && ["run", "step", "steps", "trace", "subagent", "session", "message", "artifact", "version", "review", "job", "annotations"].includes(context)) ? ids.id(child) : visit(child, key)]));
    };
    return visit(value);
}
/** Map structured references only. Prose, URLs, paths and CAS hashes remain byte exact. */
export function remapReferences(references, ids, projectId) {
    return references?.map((reference) => ({ ...reference,
        id: reference.kind === "skill" || reference.kind === "dbrecord" ? reference.id : ids.id(reference.id),
        ...(reference.sessionId ? { sessionId: ids.id(reference.sessionId) } : {}),
        ...(reference.projectId ? { projectId } : {}),
    }));
}
export function remapMessages(messages, ids, projectId) {
    return messages.map((message) => ({ ...remapRunEvent(message, ids), id: ids.id(message.id),
        references: remapReferences(message.references, ids, projectId),
        annotations: message.annotations?.map((annotation) => ({ ...remapRunEvent(annotation, ids), id: ids.id(annotation.id) })),
    }));
}
export async function restoreHistory(store, sessionId, source, ids) {
    for (const run of source.executionRuns ?? [])
        await store.appendExecutionRun({
            ...remapRunEvent(run, ids), id: ids.id(run.id), sessionId, turnId: ids.id(run.turnId),
            toolCallId: ids.optional(run.toolCallId),
            environmentRevisionId: ids.optional(run.environmentRevisionId) ?? null,
        });
    for (const manifest of source.promptManifests ?? [])
        await store.appendPromptManifest({
            ...remapRunEvent(manifest, ids), id: ids.id(manifest.id), sessionId, turnId: ids.id(manifest.turnId),
        });
    await store.appendArtifactDerivations(sessionId, (source.artifactDerivations ?? []).map((row) => ({
        ...remapRunEvent(row, ids), id: ids.id(row.id), sessionId, turnId: ids.id(row.turnId), executionRunIds: row.executionRunIds.map((id) => ids.id(id)),
    })));
    for (const child of source.subagents ?? [])
        await store.restoreHistoricalSubagent({
            ...remapRunEvent(child, ids), id: ids.id(child.id), sessionId, parentTurnId: ids.id(child.parentTurnId),
            steps: child.steps.map((step) => ({ ...remapRunEvent(step, ids), id: ids.id(step.id), toolCallId: ids.optional(step.toolCallId), status: step.status === "running" ? "failed" : step.status })),
        });
    await store.appendEvidence(sessionId, (source.claims ?? []).map((claim) => ({
        ...remapRunEvent(claim, ids), id: ids.id(claim.id), sessionId, turnId: ids.id(claim.turnId), reviewRunId: ids.id(claim.reviewRunId),
    })), (source.evidenceLinks ?? []).map((link) => ({
        ...remapRunEvent(link, ids), id: ids.id(link.id), claimId: ids.id(link.claimId), evidenceItemId: ids.optional(link.evidenceItemId),
    })));
}
// Restore evidence origins after the artifact records they reference are available.
export async function restoreEvidenceItems(store, sessionId, source, ids) {
    for (const execution of source.shellExecutions ?? [])
        await store.shellExecutions.restoreHistorical({
            ...execution, id: ids.id(execution.id), sessionId, turnId: ids.id(execution.turnId),
            agentId: execution.agentId === "main" ? "main" : ids.id(execution.agentId), workspaceId: ids.id(execution.workspaceId),
            result: execution.result ? remapRunEvent(execution.result, ids) : undefined,
        });
    await store.appendEvidenceItems(sessionId, (source.evidenceItems ?? []).map((item) => {
        const origin = item.origin;
        return { ...remapRunEvent(item, ids), id: ids.id(item.id), sessionId, turnId: ids.id(item.turnId), origin: origin.kind === "artifact" ? { ...origin, artifactId: ids.id(origin.artifactId) }
                : origin.kind === "execution" ? { ...origin, executionRunId: ids.id(origin.executionRunId) } : remapRunEvent(origin, ids) };
    }));
}
export function remapWorkspaceProvenance(source, sessionId, projectId, ids, versionIds) {
    const revision = (row) => ({
        ...row, id: ids.id(row.id), fileId: ids.id(row.fileId), sessionId, projectId,
        parentRevisionId: ids.optional(row.parentRevisionId), runId: ids.optional(row.runId),
        executionRunId: ids.optional(row.executionRunId), toolCallId: ids.optional(row.toolCallId), subagentId: ids.optional(row.subagentId),
        artifactVersionIds: row.artifactVersionIds.flatMap((id) => versionIds.has(id) ? [versionIds.get(id)] : []),
    });
    return {
        ...source, file: { ...source.file, id: ids.id(source.file.id), currentRevisionId: ids.id(source.file.currentRevisionId), sessionId, projectId },
        currentRevision: revision(source.currentRevision), revisions: source.revisions.map(revision),
    };
}
export function remapMemorySnapshot(snapshot, sessionIds, projectId, ids, artifactIds) {
    const identityFields = new Set(["goal_id", "task_id", "code_id", "evidence_id", "claim_id", "search_id", "file_id",
        "turn_id", "parent_subtask_id", "subagent_id", "tool_call_id", "execution_id", "run_id", "environment_revision_id"]);
    const properties = (source) => Object.fromEntries(Object.entries(source).map(([key, value]) => {
        if (typeof value !== "string")
            return [key, value];
        if (key === "session_id")
            return [key, sessionIds.get(value)];
        if (key === "project_id")
            return [key, projectId];
        if (key === "artifact_id")
            return [key, artifactIds.get(value) ?? ids.id(value)];
        if (identityFields.has(key))
            return [key, ids.id(value)];
        return [key, value];
    }));
    return {
        nodes: snapshot.nodes.map((node) => ({ ...node, properties: properties(node.properties) })),
        edges: snapshot.edges.map((edge) => ({ ...edge, properties: properties(edge.properties) })),
    };
}
