// Copyright (C) 2026-2026 Huawei Technologies Co., Ltd
// Licensed under the Apache License, Version 2.0 (the "License");
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { jsonBytes, parseJsonBytes } from "@sciencediscovery/research-package";
import { createHash } from "node:crypto";
import { canonicalize, RECORD_MEDIA_TYPE } from "@sciencediscovery/cas";
export function emptyPackageTrajectory(sessionId) {
    const index = { schemaVersion: 1, sessionId, capturedAt: new Date().toISOString(), agents: [], entries: [], untimedEntries: [], historicalEntries: [], warnings: [] };
    return { index, details: [], runIds: [] };
}
/** Bind old event identities only to CAS closures physically present in the imported package. */
export function importedTrajectoryAccess(source, owner, objects) {
    const refs = new Set(), aliases = Object.create(null), ambiguous = new Set();
    const visitRef = (candidate, active) => {
        if (!candidate || typeof candidate !== "object")
            return false;
        const ref = candidate;
        if ((ref.pool !== "data" && ref.pool !== "agent-state") || typeof ref.digest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(ref.digest)
            || !Number.isSafeInteger(ref.size) || ref.size < 0 || typeof ref.mediaType !== "string")
            return false;
        const key = `${ref.pool}:${ref.digest}`;
        if (refs.has(key))
            return true;
        if (active.has(key))
            return false;
        const bytes = objects.get(ref.digest.slice(7));
        if (!bytes || bytes.byteLength !== ref.size || createHash("sha256").update(bytes).digest("hex") !== ref.digest.slice(7))
            return false;
        active.add(key);
        if (ref.mediaType === RECORD_MEDIA_TYPE) {
            let record;
            try {
                record = JSON.parse(new TextDecoder().decode(bytes));
            }
            catch {
                active.delete(key);
                return false;
            }
            if (record.schemaVersion !== 1 || typeof record.kind !== "string" || !Array.isArray(record.dependencies)
                || canonicalize(record) !== new TextDecoder().decode(bytes)) {
                active.delete(key);
                return false;
            }
            const declared = new Set();
            for (const dependency of record.dependencies) {
                if (!visitRef(dependency, active)) {
                    active.delete(key);
                    return false;
                }
                declared.add(canonicalize(dependency));
            }
            const validEdges = (value) => {
                if (!value || typeof value !== "object")
                    return true;
                if ("pool" in value && "digest" in value) {
                    const embedded = value;
                    return (embedded.pool === "data" || embedded.pool === "agent-state") && typeof embedded.digest === "string"
                        && /^sha256:[a-f0-9]{64}$/.test(embedded.digest) && Number.isSafeInteger(embedded.size) && embedded.size >= 0
                        && typeof embedded.mediaType === "string" && declared.has(canonicalize(embedded));
                }
                return Object.values(value).every(validEdges);
            };
            if (!validEdges(record.value)) {
                active.delete(key);
                return false;
            }
        }
        active.delete(key);
        refs.add(key);
        return true;
    };
    const rows = source && typeof source === "object" ? source.runEvents : undefined;
    for (const run of Array.isArray(rows) ? rows : []) {
        const streams = run && typeof run === "object" ? run.streams : undefined;
        for (const stream of Array.isArray(streams) ? streams : []) {
            const streamId = stream && typeof stream === "object" ? stream.streamId : undefined;
            if (typeof streamId !== "string")
                continue;
            const target = owner(streamId);
            if (!target)
                continue;
            const events = stream && typeof stream === "object" ? stream.events : undefined;
            for (const record of Array.isArray(events) ? events : []) {
                const event = record && typeof record === "object" ? record.event : undefined;
                if (!event || typeof event !== "object")
                    continue;
                const value = event, evidence = value.evidence;
                if (!evidence || typeof evidence !== "object")
                    continue;
                const agentId = evidence.agentId, contextRef = evidence.contextRef;
                if (typeof agentId !== "string" || !contextRef || typeof contextRef !== "object")
                    continue;
                const eventRefs = [contextRef, evidence.stateRef, value.payloadRef].filter((ref) => ref !== undefined);
                if (!eventRefs.every((ref) => visitRef(ref, new Set())))
                    continue;
                if (ambiguous.has(agentId))
                    continue;
                if (aliases[agentId] && aliases[agentId] !== target) {
                    delete aliases[agentId];
                    ambiguous.add(agentId);
                }
                else
                    aliases[agentId] = target;
            }
        }
    }
    return { agentAliases: aliases, refs: [...refs] };
}
export function validatePackageTrajectory(source, sessionId, runIds, agentIds) {
    const invalid = () => { throw new Error("Invalid research package trajectory"); };
    const index = source?.index;
    if (!index || index.schemaVersion !== 1 || index.sessionId !== sessionId || !Array.isArray(index.agents)
        || !Array.isArray(index.entries) || !Array.isArray(index.warnings) || !index.warnings.every((warning) => typeof warning === "string")
        || !Array.isArray(source.details) || !Array.isArray(source.runIds) || source.runIds.length !== runIds.size
        || new Set(source.runIds).size !== runIds.size || source.runIds.some((id) => !runIds.has(id)))
        invalid();
    for (const rows of [index.untimedEntries, index.historicalEntries])
        if (rows !== undefined && !Array.isArray(rows))
            invalid();
    if (index.agents.some((agent) => !agent || !agentIds.has(agent.id) || typeof agent.label !== "string"))
        invalid();
    const entries = [...index.entries, ...(index.untimedEntries ?? index.historicalEntries ?? [])];
    const entriesById = new Map();
    for (const entry of entries) {
        if (!entry || typeof entry.id !== "string" || entriesById.has(entry.id) || !agentIds.has(entry.agentId)
            || !["state", "input", "output", "thinking", "tool", "mcp", "lifecycle"].includes(entry.kind)
            || typeof entry.label !== "string" || entry.timestamp !== null && (typeof entry.timestamp !== "string" || !Number.isFinite(Date.parse(entry.timestamp))))
            invalid();
        entriesById.set(entry.id, entry);
    }
    if (source.details.length !== entries.length)
        invalid();
    const detailIds = new Set();
    for (const detail of source.details) {
        if (!detail?.entry || !entriesById.has(detail.entry.id) || detailIds.has(detail.entry.id))
            invalid();
        if (!isDeepStrictEqual(entriesById.get(detail.entry.id), detail.entry))
            invalid();
        detailIds.add(detail.entry.id);
    }
}
const path = (dataDir, sessionId) => resolve(dataDir, "research-trajectories", `${encodeURIComponent(sessionId)}.json`);
export async function readPackageTrajectory(dataDir, sessionId) {
    try {
        return parseJsonBytes(await readFile(path(dataDir, sessionId)));
    }
    catch (error) {
        if (error.code === "ENOENT")
            return undefined;
        throw error;
    }
}
export async function writePackageTrajectory(dataDir, sessionId, trajectory) {
    const target = path(dataDir, sessionId);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, jsonBytes(trajectory), { flag: "wx" });
}
/** Relocate navigation identities only; model input, reasoning and raw evidence stay exact. */
export function remapPackageTrajectory(source, sessionId, ids) {
    const agent = (id) => id.startsWith("main:") ? `main:${ids.id(id.slice(5))}`
        : id.startsWith("subagent:") ? `subagent:${ids.id(id.slice(9))}` : ids.id(id);
    const entry = (row) => ({ ...row, id: ids.id(row.id), agentId: agent(row.agentId),
        ...(row.runId ? { runId: ids.id(row.runId) } : {}),
        ...(row.contextId ? { contextId: ids.id(row.contextId) } : {}),
        ...(row.requestExecutionId ? { requestExecutionId: ids.id(row.requestExecutionId) } : {}),
    });
    const untimed = (source.index.untimedEntries ?? source.index.historicalEntries ?? []).map(entry);
    return {
        runIds: source.runIds.map((id) => ids.id(id)),
        index: { ...source.index, sessionId, agents: source.index.agents.map((row) => ({ ...row, id: agent(row.id),
                ...(row.parentId ? { parentId: agent(row.parentId) } : {}), ...(row.parentRunId ? { parentRunId: ids.id(row.parentRunId) } : {}),
            })), entries: source.index.entries.map(entry), untimedEntries: untimed, historicalEntries: untimed },
        details: source.details.map((detail) => ({ ...detail, entry: entry(detail.entry) })),
    };
}
