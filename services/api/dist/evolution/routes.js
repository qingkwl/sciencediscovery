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
import { isEvolveRunActive } from "@sciencediscovery/schema";
import { sendError, sendJson } from "../http/response.js";
import { SessionStoreHttpError } from "../store.js";
import { EvolutionStoreError } from "./store.js";
export async function handleListRuns(response, store, sessionId) {
    sendJson(response, 200, await store.listRuns(sessionId ?? undefined));
}
/**
 * One candidate's source, by the hash the event stream carries.
 *
 * Read off the disk the sidecar wrote it to rather than out of the CAS: a
 * candidate is not an artifact yet. Most of them are refused, and copying every
 * one into content-addressed storage would fill it with programs nobody keeps —
 * the copy happens when a user saves one, which is a decision, not a side
 * effect of having tried it.
 */
export async function handleGetCandidate(response, store, candidates, runId, hash) {
    const run = await readRunOr404(response, store, runId);
    if (!run)
        return;
    const source = await candidates.read(runId, hash);
    if (source === undefined) {
        // A hash the run never produced, or a source pruned with its run. Either
        // way there is nothing to show, and saying "not found" beats an empty diff
        // that reads as "the candidate changed nothing".
        return sendError(response, 404, "Candidate source not found");
    }
    sendJson(response, 200, { hash, source });
}
export async function handleStopRun(response, store, orchestrator, runId) {
    const run = await readRunOr404(response, store, runId);
    if (!run)
        return;
    if (!isEvolveRunActive(run.status)) {
        // Already finished; report the run rather than an error, because the
        // browser routinely races the terminal event.
        return sendJson(response, 200, run);
    }
    await orchestrator.stop(runId);
    sendJson(response, 202, { runId, stopping: true });
}
/**
 * Re-create a failed search from the goal its record already holds.
 *
 * The desktop has no create-run route — runs normally come from the agent's
 * `create_evolve_run` tool after a design turn — so retry has to be its own
 * narrow route. It only ever starts a run from an existing failed record, so
 * the frozen scorecard, baseline and budget cannot be replaced by the client
 * and no new design turn is paid for. The orchestrator decides whether the
 * goal is still runnable (failed status, one live search per session, current
 * isolation) and returns a refusal the caller can show. */
export async function handleRetryRun(response, store, orchestrator, runId, sessions) {
    const run = await readRunOr404(response, store, runId);
    if (!run)
        return;
    // A retry starts a new run, which writes to the Session, so an archived or
    // evidence-locked Session must be refused before anything is spent. The
    // stop route does not need this because it cannot create a run; the agent's
    // create path checks the same property before `create_evolve_run`.
    try {
        sessions?.assertSessionWritable(run.sessionId);
    }
    catch (error) {
        if (error instanceof SessionStoreHttpError) {
            return sendError(response, error.statusCode, error.message, error.code);
        }
        if (error instanceof Error && error.message === "Session is archived and read-only") {
            return sendError(response, 409, error.message);
        }
        throw error;
    }
    if (run.status !== "failed") {
        return sendError(response, 409, "Only a failed search can be retried.");
    }
    const result = await orchestrator.retry(run);
    if ("refusedBecause" in result)
        return sendError(response, 409, result.refusedBecause);
    sendJson(response, 201, result.run);
}
/**
 * Events, either as a list or as a live SSE stream.
 *
 * The stream replays from the log first and only then attaches to the live
 * feed, with records buffered in between — attaching after the replay would
 * drop anything that arrived while the file was being read, which on a fast
 * search is most of the interesting part.
 */
export async function handleRunEvents(request, response, store, orchestrator, runId, after) {
    const run = await readRunOr404(response, store, runId);
    if (!run)
        return;
    const wantsSse = /\btext\/event-stream\b/.test(request.headers.accept ?? "");
    if (!wantsSse) {
        sendJson(response, 200, await store.readEvents(runId, after));
        return;
    }
    response.writeHead(200, {
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "content-type": "text/event-stream; charset=utf-8",
        "x-accel-buffering": "no",
        "x-content-type-options": "nosniff",
    });
    response.flushHeaders();
    let lastSequence = after;
    let buffering = true;
    const buffered = [];
    let sawTerminal = !isEvolveRunActive(run.status);
    const deliver = (record) => {
        if (record.sequence <= lastSequence)
            return;
        lastSequence = record.sequence;
        writeSse(response, record);
        if (record.event.type === "search_finished")
            sawTerminal = true;
    };
    const unsubscribe = orchestrator.subscribe(runId, (record) => {
        if (buffering) {
            buffered.push(record);
            return;
        }
        deliver(record);
        if (sawTerminal)
            response.end();
    }, 
    // A run can settle without a `search_finished` — staging failed, or the
    // sidecar was never reached. Without this the socket waits for an event
    // that is never coming.
    () => { response.end(); });
    response.once("close", unsubscribe);
    for (const record of await store.readEvents(runId, after))
        deliver(record);
    buffering = false;
    for (const record of buffered.toSorted((left, right) => left.sequence - right.sequence))
        deliver(record);
    if (sawTerminal)
        response.end();
}
function writeSse(response, record) {
    if (response.destroyed || response.writableEnded)
        return;
    response.write(`id: ${record.sequence}\n`);
    response.write(`data: ${JSON.stringify(record)}\n\n`);
}
async function readRunOr404(response, store, runId) {
    let run;
    try {
        run = await store.readRun(runId);
    }
    catch (error) {
        // An invalid id (path traversal, empty) reads as "not found" to the caller;
        // the store already refused to touch the filesystem.
        if (error instanceof EvolutionStoreError) {
            sendError(response, 404, "Evolve run not found");
            return undefined;
        }
        throw error;
    }
    if (!run) {
        sendError(response, 404, "Evolve run not found");
        return undefined;
    }
    return run;
}
