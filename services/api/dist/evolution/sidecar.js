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
export class EvolveSidecarError extends Error {
    status;
    constructor(message, status) {
        super(message);
        this.status = status;
    }
}
export class EvolveSidecarClient {
    options;
    constructor(options) {
        this.options = options;
    }
    async connection() {
        const connection = this.options.connection ? await this.options.connection() : this.options;
        if (!connection.url)
            throw new EvolveSidecarError("Evolve is not initialized. Select Init Evolve to download and install it.", 503);
        return { ...connection, url: connection.url.replace(/\/$/, "") };
    }
    /** The wire body, built once: `/runs` and `/probe` have to agree about every
     *  field, or the probe measures a different search than the one that runs. */
    body(spec) {
        return {
            algorithm: spec.algorithm,
            baseline_code: spec.baselineCode ?? "",
            baseline_score: spec.baselineScore,
            candidate_timeout_seconds: spec.candidateTimeoutSeconds ?? 60,
            dataset_dir: spec.datasetDir ?? "",
            engine: spec.engine ?? "stub",
            expansions: spec.expansions,
            judge: spec.judge ?? {},
            llm: spec.llm ?? {},
            max_tokens_per_call: spec.maxTokensPerCall ?? 16_000,
            options: spec.options ?? {},
            resume_from_sequence: spec.resumeFromSequence ?? 0,
            sandbox: spec.sandbox ?? {},
            scorecard: spec.scorecard ?? {},
            scorecard_hash: spec.scorecardHash,
            search_id: spec.searchId,
            packages: spec.packages ?? [],
            rubric: spec.rubric ?? "",
            script: spec.script ?? "",
            statement: spec.statement ?? "",
            thinking: spec.thinking ?? "",
            thinking_effort: spec.thinkingEffort ?? "",
            workspace_dir: spec.workspaceDir ?? "",
            workers: spec.workers ?? 1,
        };
    }
    /**
     * Score the starting point and a deliberately worse copy of it.
     *
     * Two evaluations before a run exists, which is what the answer costs. It
     * cannot be derived from the goal: "can this scoring tell a good candidate
     * from a bad one" is a fact about the data and the scorer, and its failure is
     * the silent one — a flat scorecard produces a search that emits every event
     * and finds nothing.
     */
    async probe(spec) {
        const { url, internalToken } = await this.connection();
        const response = await fetch(`${url}/probe`, {
            body: JSON.stringify(this.body(spec)),
            headers: { authorization: `Bearer ${internalToken}`, "content-type": "application/json" },
            method: "POST",
        });
        if (!response.ok) {
            // The sidecar's own sentence, not its response body. A probe refusal is
            // the one sidecar error a user is expected to read and act on — it is
            // what stands between them and starting a run — and pasting
            // `{"detail":{"code":"probe_failed","message":"…"}}` onto the screen
            // hands them the wrapper and buries the sentence inside it.
            throw new EvolveSidecarError(response.status === 401 || response.status === 403
                ? "Evolve authentication failed. Check the configured service or retry Init Evolve."
                : await refusal(response, "the discrimination probe could not be taken"), response.status);
        }
        return await response.json();
    }
    async health() {
        try {
            const { url } = await this.connection();
            const response = await fetch(`${url}/health`);
            if (!response.ok)
                return undefined;
            return await response.json();
        }
        catch {
            return undefined;
        }
    }
    /**
     * Start a search and yield every event record it emits.
     *
     * `signal` aborts the HTTP request, which closes the sidecar's generator and
     * winds the engine down — the same path a crashed API takes, so it is
     * exercised by every cancelled run rather than only by a disaster.
     */
    async *stream(spec, signal, warn) {
        const { url, internalToken } = await this.connection();
        const response = await fetch(`${url}/runs`, {
            body: JSON.stringify(this.body(spec)),
            headers: { authorization: `Bearer ${internalToken}`, "content-type": "application/json" },
            method: "POST",
            signal,
        });
        if (!response.ok || !response.body) {
            // A refusal may be a proxy page or contain private upstream diagnostics.
            // Discard it without buffering it into the user-facing run error.
            await response.body?.cancel().catch(() => undefined);
            throw new EvolveSidecarError(response.status === 401 || response.status === 403
                ? "Evolve authentication failed. Check the configured service or retry Init Evolve."
                : `Evolve service ${response.ok ? "returned no run stream" : "refused the run"} (HTTP ${response.status}). Check the service configuration or retry Init Evolve.`, response.status);
        }
        yield* parseNdjsonStream(response.body, warn);
    }
    /** Idempotent by contract: stopping an unknown or finished search is a
     * no-op, because the API races the stream's own completion.
     *
     * `why` travels with the request because the sidecar cannot work it out: it is
     * handed a stop flag and no budget, so a token gate and a person pressing stop
     * are the same request over there. The cause is what lets it run one bounded
     * held-out evaluation for a budget that ran out, while a user stop still
     * aborts immediately.
     *
     * The sidecar keeps the **first** cause it was given, so a second stop can be
     * answered up to one bounded evaluation late while a budget finalization is
     * already running; that evaluation is capped by the candidate timeout. */
    async stop(searchId, why) {
        try {
            const { url, internalToken } = await this.connection();
            const response = await fetch(`${url}/runs/${encodeURIComponent(searchId)}/stop`, {
                body: JSON.stringify(why ?? {}),
                headers: { authorization: `Bearer ${internalToken}`, "content-type": "application/json" },
                method: "POST",
            });
            if (!response.ok)
                return false;
            const body = await response.json();
            return body.stopped === true;
        }
        catch {
            return false;
        }
    }
}
/**
 * Split an NDJSON byte stream into event records.
 *
 * The buffer matters: a chunk boundary lands mid-line often enough that parsing
 * per chunk would drop roughly one event per network buffer. A trailing partial
 * line at end-of-stream is dropped — it is a torn write from a killed sidecar,
 * and the same tolerance the on-disk log reader applies.
 */
export async function* parseNdjsonStream(body, warn) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
            const record = parseRecord(line, warn);
            if (record)
                yield record;
        }
        if (done)
            break;
    }
    if (buffer.trim())
        warn?.(`dropped a torn trailing line (${buffer.length} bytes)`);
}
function parseRecord(line, warn) {
    if (!line.trim())
        return undefined;
    let parsed;
    try {
        parsed = JSON.parse(line);
    }
    catch {
        warn?.(`skipped a malformed NDJSON line (${line.slice(0, 120)})`);
        return undefined;
    }
    if (typeof parsed.sequence !== "number" || typeof parsed.createdAt !== "string" || !parsed.event?.type) {
        warn?.("skipped a record that is not an event");
        return undefined;
    }
    return parsed;
}
/**
 * The message inside a sidecar error response, or a plain fallback.
 *
 * FastAPI wraps a refusal as `{"detail": {"code": …, "message": …}}` and a
 * validation failure as `{"detail": [...]}`; older handlers send a bare string.
 * All three read as noise on a screen, and the sentence a user needs is one
 * level in.
 */
export async function refusal(response, prefix) {
    const text = await response.text().catch(() => "");
    try {
        const body = JSON.parse(text);
        const detail = body.detail;
        if (typeof detail === "string" && detail.trim())
            return detail;
        if (detail && typeof detail === "object" && !Array.isArray(detail)) {
            const message = detail.message;
            if (typeof message === "string" && message.trim())
                return message;
        }
    }
    catch {
        // Not JSON at all — a proxy page, an empty body. Falls through.
    }
    return `${prefix} (${response.status})${text ? `: ${text.slice(0, 300)}` : ""}`;
}
