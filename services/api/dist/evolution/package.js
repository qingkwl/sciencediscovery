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
/** Carrying a session's evolve runs through a research package.
 *
 * A run's result files travel as ordinary artifacts (`evolve/<run>/<entrypoint>`),
 * which is why an imported session used to show the candidate files with no run
 * behind them: the search tree, the scores and the budget lived only in the
 * export's own store (#1019). This module packages the run records and their
 * event log, and restores both on import under the *new* session id.
 *
 * The package is user-supplied input, so every field is validated here rather
 * than trusted: a run id must satisfy the store's own rule, an event must carry
 * an integer sequence, and a status must be one of the known values.
 */
import { randomUUID } from "node:crypto";
import { isEvolveRunActive } from "@sciencediscovery/schema";
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const STATUSES = new Set(["budget_exhausted", "failed", "pending", "running", "stopped", "succeeded"]);
/** A package cannot ask the importer to create an unbounded number of runs. */
export const MAX_RUNS = 200;
/** Every run of the given sessions, with its event log, oldest first so a
 *  reader can replay the search in the order it happened. */
export async function exportEvolveRuns(store, sessionIds) {
    const wanted = new Set(sessionIds);
    const runs = (await store.listRuns()).filter((run) => wanted.has(run.sessionId));
    const ordered = [...runs].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    // Cap by keeping the newest runs; the tail of an oldest-first list is still
    // oldest-first, so the dropped set is the oldest and the receipt can say so.
    const packed = [];
    for (const run of ordered.slice(-MAX_RUNS)) {
        packed.push({ events: await store.readEvents(run.id), run });
    }
    return { runs: packed, truncated: Math.max(0, ordered.length - MAX_RUNS) };
}
function asRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value) ? value : undefined;
}
function optionalString(value, limit = 4_000) {
    return typeof value === "string" && value.length > 0 ? value.slice(0, limit) : undefined;
}
function validEvents(value) {
    if (!Array.isArray(value))
        return [];
    return value.flatMap((entry) => {
        const record = asRecord(entry);
        const sequence = record?.sequence;
        const event = asRecord(record?.event);
        // `parseEventLines` drops a record without a string `createdAt` on read, so
        // accepting one here would advance the watermark past events no reader sees.
        if (!Number.isInteger(sequence) || Number(sequence) < 1 || typeof record?.createdAt !== "string"
            || !event || typeof event.type !== "string")
            return [];
        return [{ createdAt: record.createdAt, event, sequence }];
    });
}
const EVOLVE_ALGORITHMS = new Set(["puct", "openevolve"]);
/** A goal is restorable only when it carries the fields the web client
 *  dereferences unconditionally: `EvolveRunCard` reads `goal.budget.expansions`,
 *  and `EvolvePanel` reads `goal.scorecard`, `goal.target` and
 *  `goal.baselineProgramCas`. A goal missing any of them would break the evolve
 *  card/panel once the imported session is opened, so such a run is dropped
 *  with an omission instead of restored broken. */
function validGoal(value) {
    const goal = asRecord(value);
    if (!goal)
        return undefined;
    const budget = asRecord(goal.budget);
    if (!EVOLVE_ALGORITHMS.has(goal.algorithm)
        || typeof goal.statement !== "string"
        || typeof goal.baselineProgramCas !== "string"
        || !budget || !Number.isInteger(budget.expansions)
        || !asRecord(goal.scorecard) || !asRecord(goal.target))
        return undefined;
    return goal;
}
function validDateString(value) {
    if (typeof value !== "string")
        return undefined;
    return Number.isNaN(Date.parse(value)) ? undefined : value;
}
/**
 * Recreate the package's runs under `target.sessionId`.
 *
 * An active run at export time is stored as `stopped`: nothing is executing on
 * the importing machine, and presenting it as `running` would show a search that
 * can never advance. Colliding ids are remapped so each session owns its copy.
 */
export async function restoreEvolveRuns(store, target, payload) {
    const result = { omissions: [], restored: 0, runIds: new Map() };
    if (payload === undefined || payload === null)
        return result;
    const container = asRecord(payload);
    const entries = Array.isArray(container?.runs) ? container.runs : undefined;
    if (!entries) {
        result.omissions.push("evolve:package carries an evolve record that is not a run list");
        return result;
    }
    const carried = entries.length;
    const withinCap = entries.slice(0, MAX_RUNS);
    if (carried > MAX_RUNS) {
        result.omissions.push(`evolve:package carries ${carried} runs; only the first ${MAX_RUNS} were restored`);
    }
    for (const entry of withinCap) {
        const packed = asRecord(entry);
        const run = asRecord(packed?.run);
        const id = typeof run?.id === "string" ? run.id : "";
        if (!RUN_ID.test(id)) {
            result.omissions.push("evolve:package carries a run with an invalid id");
            continue;
        }
        if (result.runIds.has(id)) {
            result.omissions.push(`evolve:${id}:duplicate run id in package`);
            continue;
        }
        const targetId = await store.readRun(id) ? randomUUID() : id;
        const rawGoal = asRecord(run?.goal);
        if (!rawGoal) {
            result.omissions.push(`evolve:${id}:missing the run goal`);
            continue;
        }
        const goal = validGoal(rawGoal);
        if (!goal) {
            result.omissions.push(`evolve:${id}:invalid run goal`);
            continue;
        }
        const status = typeof run?.status === "string" && STATUSES.has(run.status) ? run.status : "failed";
        const createdAt = validDateString(run?.createdAt);
        try {
            await store.createRun({
                goal: goal,
                id: targetId,
                ...(createdAt ? { createdAt } : {}),
                ...(target.projectId ? { projectId: target.projectId } : {}),
                sessionId: target.sessionId,
            });
            const events = validEvents(packed?.events);
            if (events.length)
                await store.appendEvents(targetId, events);
            const startedAt = optionalString(run?.startedAt, 40);
            const finishedAt = optionalString(run?.finishedAt, 40);
            const error = optionalString(run?.error, 2_000);
            await store.patchRun(targetId, {
                ...(Number.isInteger(run?.bestNodeIndex) ? { bestNodeIndex: Number(run?.bestNodeIndex) } : {}),
                candidates: Number.isInteger(run?.candidates) ? Number(run?.candidates) : 0,
                costCents: Number.isFinite(run?.costCents) ? Number(run?.costCents) : 0,
                ...(startedAt ? { startedAt } : {}),
                ...(finishedAt ? { finishedAt } : {}),
                ...(error ? { error } : {}),
                status: isEvolveRunActive(status) ? "stopped" : status,
                tokens: Number.isInteger(run?.tokens) ? Number(run?.tokens) : 0,
            });
            result.restored += 1;
            result.runIds.set(id, targetId);
        }
        catch (caught) {
            result.omissions.push(`evolve:${id}:${caught instanceof Error ? caught.message : "restore failed"}`);
        }
    }
    return result;
}
