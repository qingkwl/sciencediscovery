// Copyright (C) 2026-2026 Huawei Technologies Co., Ltd
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
import { jsonDigest } from "@sciencediscovery/research-package";
import { portableShellResult } from "./research-shell-result.js";
import { remapMemorySnapshot, remapMessages, remapReferences, remapRunEvent, remapRunStreamId } from "./research-package-history.js";
import { remapPackageTrajectory } from "./research-package-trajectory.js";
const rows = (value) => Array.isArray(value) ? value : [];
const comparable = (value) => value === undefined ? "undefined" : jsonDigest(value);
// Runner workspace receipts point at the source runner installation. Historical
// shell results intentionally drop those receipts during restore, so they are
// not part of the portable research copy. The command output and all other
// result metadata remain covered by the integrity check.
function equal(label, expected, actual) {
    if (comparable(expected) !== comparable(actual))
        throw new Error(`Research copy integrity mismatch: ${label}`);
}
function restoredSubagentField(field, value) {
    if (field === "status" && value === "running")
        return "cancelled";
    if (field !== "steps" || !Array.isArray(value))
        return value;
    return value.map((step) => step && typeof step === "object" && step.status === "running"
        ? { ...step, status: "failed" } : step);
}
function graphRows(snapshot) {
    const key = (node) => comparable({ labels: [...node.labels].sort(), properties: node.properties });
    const nodes = new Map(snapshot.nodes.map((node) => [node.id, key(node)]));
    return { nodes: [...nodes.values()].sort(), edges: snapshot.edges.map((edge) => comparable({ source: nodes.get(edge.source), target: nodes.get(edge.target), type: edge.type, properties: edge.properties })).sort() };
}
/** Fail closed before publishing a writable copy. CAS hashes cover file/log bytes. */
export function verifyResearchCopy(sourceValue, targetValue, ids, sessions, projectId, 
/** Source evolve run id -> restored run id: a remapped run renames its result
 *  artifact (`evolve/<run>/<entrypoint>`), so the expected side is remapped the
 *  same way before comparing (#1176 review F3). */
evolveRunIds) {
    const remapEvolveName = (value) => {
        if (typeof value !== "string" || !evolveRunIds)
            return value;
        const match = /^evolve\/([^/]+)\//.exec(value);
        if (!match)
            return value;
        for (const [sourceRunId, restoredRunId] of evolveRunIds) {
            if (sourceRunId.slice(0, 8) === match[1])
                return value.replace(`evolve/${match[1]}/`, `evolve/${restoredRunId.slice(0, 8)}/`);
        }
        return value;
    };
    const remapEvolveOrigin = (value) => {
        if (typeof value !== "object" || value === null || !evolveRunIds)
            return value;
        const meta = value;
        const id = meta.evolveRunId;
        const mapped = typeof id === "string" ? evolveRunIds.get(id) : undefined;
        return mapped && mapped !== id ? { ...meta, evolveRunId: mapped } : meta;
    };
    const source = sourceValue, target = targetValue;
    equal("session count", source.sessions?.length ?? 0, target.sessions?.length ?? 0);
    for (const original of source.sessions ?? []) {
        const sourceId = original.session.id;
        const copy = target.sessions?.find((item) => item.session.id === sessions.get(sourceId));
        if (!copy)
            throw new Error("Research copy session missing");
        if (original.trajectory) {
            const expected = remapPackageTrajectory(original.trajectory, sessions.get(sourceId), ids);
            const actual = copy.trajectory;
            if (!actual)
                throw new Error("Research copy trajectory missing");
            equal("trajectory details", expected.details, actual.details);
            for (const field of ["agents", "entries", "untimedEntries", "warnings"])
                equal(`trajectory.${field}`, expected.index[field], actual.index[field]);
            equal("trajectory runs", expected.runIds, actual.runIds);
        }
        equal("transcript", remapMessages(original.messages ?? [], ids, projectId), copy.messages ?? []);
        equal("artifact annotations", rows(original.artifactAnnotations).map((annotation) => ({ ...remapRunEvent(annotation, ids), id: ids.id(String(annotation.id)) })), copy.artifactAnnotations ?? []);
        const files = (value) => rows(value).map(({ path, objectPath, size }) => ({ path, objectPath, size })).sort((a, b) => String(a.path).localeCompare(String(b.path)));
        equal("workspace bytes", files(original.workspace), files(copy.workspace));
        for (const kind of ["executionRuns", "promptManifests", "artifactDerivations", "subagents", "shellExecutions", "claims", "evidenceLinks", "evidenceItems"]) {
            const expected = rows(original[kind]), actual = rows(copy[kind]);
            equal(`${kind} count`, expected.length, actual.length);
            // Execution history is append-only: one ID can carry an `unconfirmed`
            // observation followed by its settled outcome. Pair source and target
            // observations by (id, position) so each is verified against its own
            // restored twin, never the first row that happens to share the ID.
            const byId = new Map();
            for (const item of actual) {
                const list = byId.get(String(item.id)) ?? [];
                list.push(item);
                byId.set(String(item.id), list);
            }
            const consumed = new Map();
            for (const row of expected) {
                const mapped = remapRunEvent(row, ids);
                const key = ids.id(String(row.id));
                const restored = (byId.get(key) ?? [])[consumed.get(key) ?? 0];
                if (!restored)
                    throw new Error(`Research copy missing ${kind}`);
                consumed.set(key, (consumed.get(key) ?? 0) + 1);
                // Content and immutable object identities; runtime receipts are deliberately not replayed.
                for (const field of ["content", "text", "code", "stdout", "stderr", "envSnapshot", "inputs", "systemPrompt", "steps", "result", "origin", "sessionId", "turnId", "parentTurnId", "toolCallId", "environmentRevisionId", "executionRunIds", "claimId", "evidenceItemId", "reviewRunId", "createdAt", "startedAt", "finishedAt", "status", "state", "queuedAt", "accepted", "provenance", "path"]) {
                    if (field in row) {
                        const expected = kind === "shellExecutions" && field === "result" && mapped[field]
                            ? portableShellResult(mapped[field])
                            : kind === "subagents" ? restoredSubagentField(field, mapped[field]) : mapped[field];
                        equal(`${kind}.${field}`, expected, restored[field]);
                    }
                }
            }
        }
        const runs = rows(original.runs), restoredRuns = rows(copy.runs);
        equal("run count", runs.length, restoredRuns.length);
        for (const run of runs) {
            const restored = restoredRuns.find((item) => item.id === ids.id(String(run.id)));
            if (!restored)
                throw new Error("Research copy run missing");
            const mapped = remapRunEvent(run, ids);
            const restoredStatus = ["queued", "running", "blocked"].includes(String(mapped.status)) ? "cancelled" : mapped.status;
            for (const field of ["prompt", "queueOrder", "createdAt", "startedAt", "userMessageId", "assistantMessageId", "settingsSnapshot"]) {
                equal(`run.${field}`, mapped[field] ?? null, restored[field] ?? null);
            }
            equal("run.status", restoredStatus, restored.status ?? null);
            if (restoredStatus === "cancelled" && mapped.finishedAt == null) {
                if (typeof restored.finishedAt !== "string" || !Number.isFinite(Date.parse(restored.finishedAt))) {
                    throw new Error("Research copy integrity mismatch: run.finishedAt");
                }
            }
            else {
                equal("run.finishedAt", mapped.finishedAt ?? null, restored.finishedAt ?? null);
            }
            equal("run.references", remapReferences(run.references, ids, projectId) ?? [], restored.references ?? []);
        }
        // Exporting a restored run materializes an empty main stream even when the
        // package omitted event history. Empty containers carry no observations.
        const streams = (value, remap) => rows(value).flatMap((entry) => rows(entry.streams).filter((stream) => rows(stream.events).length > 0).map((stream) => ({ runId: remap ? ids.id(String(entry.runId)) : entry.runId, streamId: remap ? remapRunStreamId(String(stream.streamId), ids) : stream.streamId, events: rows(stream.events).map(({ sequence, createdAt, event }) => ({ sequence, createdAt, event: remap ? remapRunEvent(event, ids) : event })) }))).sort((a, b) => comparable([a.runId, a.streamId]).localeCompare(comparable([b.runId, b.streamId])));
        equal("run event streams", streams(original.runEvents, true), streams(copy.runEvents, false));
        // Explicit revision counts/hashes and all attribution links, independent of filesystem timestamp precision.
        for (const provenance of rows(original.workspaceProvenance)) {
            const restored = rows(copy.workspaceProvenance).find((item) => item.file.path === provenance.file.path);
            if (!restored)
                throw new Error("Research copy provenance missing");
            const expected = rows(provenance.revisions), actual = rows(restored.revisions);
            equal("revision count", expected.length, actual.length);
            for (const revision of expected) {
                const mapped = remapRunEvent(revision, ids);
                const found = actual.find((item) => item.id === ids.id(String(revision.id)));
                if (!found)
                    throw new Error("Research copy revision missing");
                for (const field of ["fileId", "sessionId", "projectId", "parentRevisionId", "path", "contentHash", "origin", "size", "createdAt", "runId", "executionRunId", "toolCallId", "subagentId"])
                    equal(`revision.${field}`, mapped[field] ?? null, found[field] ?? null);
                equal("revision artifacts", revision.artifactVersionIds.map((id) => ids.id(id)).sort(), [...found.artifactVersionIds].sort());
            }
        }
        const targetVersionIds = new Set((target.artifacts ?? []).flatMap((artifact) => (artifact.versions ?? []).map((version) => String(version.id))));
        const targetReviewIds = new Set([
            ...rows(copy.validations?.artifactReviews),
            ...rows(copy.validations?.reviews),
        ].map((review) => String(review.id)));
        for (const kind of ["artifactReviews", "reviews", "reviewerAuditTasks", "reviewFeedback"]) {
            const expected = rows(original.validations?.[kind]), actual = rows(copy.validations?.[kind]);
            equal(`validation.${kind} count`, expected.length, actual.length);
            const mappedReferences = (record, field) => (Array.isArray(record[field]) ? record[field] : []).map((value) => {
                const sourceId = String(value);
                const mapped = ids.values.get(sourceId);
                if (!mapped)
                    throw new Error(`Research copy integrity mismatch: validation.${kind}.${field}[${sourceId}] has no ID mapping`);
                const targetIds = field === "artifactVersionIds" ? targetVersionIds : targetReviewIds;
                if (!targetIds.has(mapped))
                    throw new Error(`Research copy integrity mismatch: validation.${kind}.${field}[${sourceId}] was not restored`);
                return mapped;
            });
            for (const record of expected) {
                const restored = actual.find((item) => item.id === ids.id(String(record.id)));
                if (!restored)
                    throw new Error(`Research copy missing ${kind}`);
                const normalized = { ...remapRunEvent(record, ids), id: ids.id(String(record.id)) };
                // Restoring a writable copy must not resume work that was active in the
                // source package. Feedback that was ready for the source agent is also
                // intentionally dismissed so it cannot be consumed twice.
                if (kind === "reviewerAuditTasks" && ["queued", "running"].includes(String(record.status)))
                    normalized.status = "cancelled";
                if (kind === "reviewFeedback" && record.status === "ready")
                    normalized.status = "dismissed";
                if (kind === "reviewerAuditTasks" || kind === "reviewFeedback") {
                    normalized.artifactVersionIds = mappedReferences(record, "artifactVersionIds");
                    if ("reviewIds" in record)
                        normalized.reviewIds = mappedReferences(record, "reviewIds");
                }
                const fields = new Set([...Object.keys(normalized), ...Object.keys(restored)]);
                for (const field of fields)
                    equal(`validation.${kind}.${field}`, normalized[field], restored[field]);
            }
        }
    }
    equal("artifact count", source.artifacts?.length ?? 0, target.artifacts?.length ?? 0);
    for (const artifact of source.artifacts ?? []) {
        const restored = target.artifacts?.find((item) => item.id === ids.id(String(artifact.id)));
        if (!restored)
            throw new Error("Research copy artifact missing");
        for (const field of ["name", "logicalName", "title", "description", "kind", "origin", "originMeta", "createdAt", "updatedAt", "currentVersion"]) {
            const expected = field === "name" || field === "logicalName"
                ? remapEvolveName(artifact[field])
                : field === "originMeta" ? remapEvolveOrigin(artifact[field]) : artifact[field];
            equal(`artifact.${field}`, expected ?? null, restored[field] ?? null);
        }
        equal("artifact version count", artifact.versions?.length ?? 0, restored.versions?.length ?? 0);
        for (const version of artifact.versions ?? []) {
            const found = restored.versions?.find((item) => item.id === ids.id(version.id));
            if (!found)
                throw new Error("Research copy artifact version missing");
            for (const field of ["content", "mediaType", "sourcePath", "createdAt", "version"]) {
                const expected = field === "sourcePath" ? remapEvolveName(version[field]) : version[field];
                equal(`artifact.${field}`, expected ?? null, found[field] ?? null);
            }
            equal("artifact session", ids.id(version.sessionId), found.sessionId);
            equal("artifact turn", version.turnId ? ids.id(version.turnId) : null, found.turnId ?? null);
            equal("artifact executions", version.executionRunIds.map((id) => ids.id(id)), found.executionRunIds);
            equal("artifact inputs", version.inputArtifactVersionIds.map((id) => ids.id(id)).sort(), [...found.inputArtifactVersionIds].sort());
            equal("artifact references", remapReferences(version.references, ids, projectId) ?? [], found.references ?? []);
            equal("artifact ancestry", version.baseVersionId ? ids.id(version.baseVersionId) : null, found.baseVersionId ?? null);
        }
    }
    if (source.memoryGraph) {
        if (!target.memoryGraph)
            throw new Error("Research copy scientific memory missing");
        equal("scientific memory", graphRows(remapMemorySnapshot(source.memoryGraph, sessions, projectId, ids, new Map())), graphRows(target.memoryGraph));
    }
}
