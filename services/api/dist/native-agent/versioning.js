// Copyright (C) 2026-2026 Huawei Technologies Co., Ltd
// Licensed under the Apache License, Version 2.0 (the "License");
import { recordingStage } from "../agent-run/recording-wait.js";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { RefStore, committedWorkspaceSnapshot, StepCommitCoordinator, VersionStore, } from "@sciencediscovery/cas";
/** Convert optional object fields to their existing JSON wire semantics before strict JCS. */
export function jsonValue(value) { return JSON.parse(JSON.stringify(value)); }
function isSubagentHandoff(details) {
    return typeof details === "object" && details !== null
        && "subagent" in details && "summary" in details;
}
let buildDescriptor;
export function harnessBuildDigest() {
    buildDescriptor ??= (async () => {
        const hash = createHash("sha256");
        const walk = async (root, dir) => {
            for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : 1)) {
                const path = resolve(dir, entry.name);
                if (entry.isDirectory())
                    await walk(root, path);
                else if (entry.isFile() && /\.(js|ts)$/.test(entry.name) && !/\.(test|d)\.(js|ts)$/.test(entry.name)) {
                    hash.update(relative(root, path));
                    hash.update("\0");
                    hash.update(await readFile(path));
                    hash.update("\0");
                }
            }
        };
        const packages = ["runtime-core", "context", "model", "tools", "workspace", "plan", "evolve", "orchestration",
            "plugin-sdk", "skill", "mcp", "scheduler", "mcp-sources"];
        for (const name of packages) {
            const root = dirname(fileURLToPath(import.meta.resolve(`@sciencediscovery/${name}`)));
            hash.update(name);
            await walk(root, root);
        }
        const api = resolve(dirname(fileURLToPath(import.meta.url)), "..");
        hash.update("api");
        await walk(api, api);
        return `sha256:${hash.digest("hex")}`;
    })();
    return buildDescriptor;
}
export function agentHeadName(agentId) { return `agents/${encodeURIComponent(agentId)}/head`; }
export class AgentStateAssembler {
    store;
    workspaceRoot;
    readRuntime;
    readAuthorities;
    identity;
    constructor(store, workspaceRoot, readRuntime, readAuthorities, identity = {}) {
        this.store = store;
        this.workspaceRoot = workspaceRoot;
        this.readRuntime = readRuntime;
        this.readAuthorities = readAuthorities;
        this.identity = identity;
        const rel = relative(resolve(workspaceRoot), resolve(store.dataDir, "versioning"));
        if (rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !rel.startsWith(sep))) {
            throw new Error("Version store must be outside the Agent workspace");
        }
    }
    captureWorkspace() {
        return recordingStage("workspace_snapshot", this.identity, () => committedWorkspaceSnapshot(this.store, this.workspaceRoot));
    }
    async assemble(input, view) {
        const authorities = view ? view.read("authorities") : await recordingStage("authority_capture", this.identity, () => this.readAuthorities());
        const workspace = view ? view.read("workspace") : await this.captureWorkspace();
        return this.store.putRecord("AgentStateSnapshot", jsonValue({
            ...input, workspace, runtime: view ? view.read("runtime") : this.readRuntime(), authorities,
            ...(view ? { checkpoint: view.checkpoint } : {}),
            forkFidelity: [
                { component: "agent-state-and-workspace", fidelity: "restorable", detail: "Captured logical state and Linux file tree; no restore API in this phase" },
                { component: "kernel-environment-memory-graph", fidelity: "reference-only", detail: "External authority identifiers are captured; process heaps and graph databases are not snapshotted" },
                { component: "external-effects", fidelity: "external-side-effect", detail: "Network calls, remote jobs and external writes cannot be rolled back" },
            ],
        }));
    }
}
export class AgentVersionRecorder {
    options;
    store;
    refs;
    coordinator;
    manifest;
    revision;
    head = null;
    before;
    modelContext;
    modelAction;
    context;
    activeContext;
    transcript = [];
    observations = [];
    turnObservations = [];
    children = [];
    assemblyTrace = null;
    currentTurn = 0;
    responseId;
    /** The turn
  esponseId was announced for, so a late id is only reused by its own record. */
    responseIdTurn;
    pending = Promise.resolve();
    assembler;
    inputView;
    constructor(dataDir, workspaceRoot, options, readRuntime) {
        this.options = options;
        this.store = new VersionStore(dataDir);
        this.assembler = new AgentStateAssembler(this.store, workspaceRoot, readRuntime, options.readAuthorities ?? (async () => ({})), { agentId: options.agentId, trajectoryId: options.trajectoryId });
    }
    async initialize(behavior, history) {
        this.refs = await RefStore.open(this.store);
        this.coordinator = new StepCommitCoordinator(this.store, this.refs, agentHeadName(this.options.agentId));
        this.head = this.refs.head(this.coordinator.name);
        this.transcript = structuredClone(history);
        const harness = await this.store.putRecord("HarnessBuild", { digest: await harnessBuildDigest(), runtime: process.version });
        this.manifest = await this.store.putRecord("AgentManifest", jsonValue({ harness, behavior }));
        const previous = this.head ? (await this.store.readRecord(this.head, "TrajectoryStep")).value : null;
        this.revision = await this.store.putRecord("AgentRevision", {
            agentId: this.options.agentId, trajectoryId: this.options.trajectoryId,
            requestExecutionId: this.options.requestExecutionId,
            manifest: this.manifest, parentRevision: previous?.revision ?? null,
        });
        const initialState = await this.state(0, "before", history);
        const start = await this.store.putRecord("TrajectoryStart", { revision: this.revision, initialState });
        await this.refs.commit(this.store, `trajectories/${encodeURIComponent(this.options.trajectoryId)}/start`, null, start);
        await this.refs.commit(this.store, `agents/${encodeURIComponent(this.options.agentId)}/trajectories/${encodeURIComponent(this.options.trajectoryId)}`, null, start);
    }
    async beforeTurn({ turn, history }) {
        this.turnObservations = [];
        this.currentTurn = turn;
        this.activeContext = undefined;
        this.responseId = undefined;
        this.responseIdTurn = undefined;
        this.children = [];
        this.assemblyTrace = null;
        this.before = await this.state(turn, "before", history);
    }
    trace(record) { this.assemblyTrace = jsonValue(record); }
    workspaceStateProvider() {
        return {
            id: "workspace",
            capture: async (signal) => {
                signal.throwIfAborted();
                const value = await this.assembler.captureWorkspace();
                return { id: "workspace", schemaVersion: 1, revision: value.digest, value, fidelity: "captured" };
            },
        };
    }
    async captureInputState(view, turn, history) {
        this.inputView = view;
        this.before = await this.state(turn, "before", history, view);
    }
    async afterAssembly({ turn, assembly }) {
        // The new response ID is allocated by the loop after assembly, including retries.
        this.responseId = undefined;
        this.responseIdTurn = undefined;
        this.modelContext = await this.store.putRecord("ModelContextSnapshot", jsonValue({
            boundary: "ProviderModelClient.invoke", input: assembly.modelInput,
        }));
        this.modelAction = undefined;
        this.context = await this.store.putRecord("ContextAssemblyRecord", jsonValue({
            turn, manifest: this.manifest, state: this.before, modelContext: this.modelContext, trace: this.assemblyTrace,
            ...(this.inputView ? { checkpoint: this.inputView.checkpoint } : {}),
        }));
        // Root the exact input before invoking the model, including attempts that later fail or cancel.
        // This is an audit root, not a completed Step and never advances the Agent head.
        // Input-overflow recovery assembles again within the same turn. History
        // keeps both attempts while the live audit ref tracks the latest input.
        const name = `attempts/${encodeURIComponent(this.options.trajectoryId)}/${turn}`;
        await recordingStage("context_ref_commit", { agentId: this.options.agentId, trajectoryId: this.options.trajectoryId, turn }, () => this.refs.commit(this.store, name, this.refs.head(name), this.context));
        this.activeContext = this.context;
        await this.record("context.captured", undefined, this.before);
    }
    async recordObservation(input) {
        const content = await this.store.put("agent-state", input.content, "text/plain;charset=utf-8");
        // `task` returns the live child snapshot for in-process consumers. That
        // snapshot can contain refs from the child's store, which must not become
        // dependencies of the parent's persisted observation.
        const details = isSubagentHandoff(input.details) ? { summary: input.details.summary } : input.details;
        const ref = await this.store.putRecord("ToolObservation", jsonValue({ ...input, ...(details === undefined ? {} : { details }), content }));
        this.turnObservations.push({ sequence: input.sequence, ref });
    }
    event(event) {
        if (event.type === "turn_start")
            this.currentTurn = event.turn;
        if (event.type === "response_start") {
            this.responseId = event.responseId;
            this.responseIdTurn = event.turn;
        }
        if (event.type === "context_recovery") {
            void this.record("context_recovery", jsonValue(event));
        }
        return this.evidence();
    }
    async modelCompleted(result, identity) {
        // Snapshot the identity the caller knew, here, rather than when the
        // recording queue drains: `beforeTurn`/`afterAssembly` clear the recorder's
        // `responseId` from inside that queue, so a later read could stamp this
        // record with a turn that had already moved on — and drop a response id
        // that had been issued for this very call (#1133).
        // The built-in loop has already seen its `response_start` when it gets
        // here, so reading now is reading this call's own id and a later read
        // would only see the next turn's clearing.
        const snapshot = identity === undefined ? this.completedEvidence(undefined) : undefined;
        const supplied = identity?.responseId ? this.completedEvidence(identity) : undefined;
        await this.pending;
        // A call that produced no text and no reasoning gets its response opened
        // later, by the adapter, so its id is minted *after* this method was
        // called. When the caller had no id to give, read the recorder now instead
        // of writing "none": that is the only moment such an id can still be seen.
        const evidence = snapshot ?? supplied ?? this.completedEvidence(identity);
        // Persist the authoritative action once, before tools run (including failures).
        // Both the Run event and the committed Step reference this same object.
        this.modelAction = await this.store.putRecord("ModelAction", jsonValue({ modelContext: this.modelContext, result }));
        await this.record("model.completed", undefined, undefined, evidence, this.modelAction);
    }
    /**
     * Evidence for a completion record, bound to the call that produced it.
     *
     * A caller that knows the response id passes it — the executor does, because
     * it is the side that sees `assistant.response.started`. A supplied id wins
     * over the recorder's field. Without one, the recorder's own value is used:
     * a tool-only call has its response opened later, and dropping that late id
     * would leave the record exactly as anonymous as the rows #1133 measured.
     */
    completedEvidence(identity) {
        const evidence = this.evidence();
        if (identity === undefined)
            return evidence;
        const turn = identity.turn ?? evidence.turn;
        // The caller's id wins. Without one, the recorder's value is used only when
        // it was announced for this same turn: a tool-only call opens its response
        // after this record was requested, and that late id belongs here, while a
        // value left over from another turn must not be attributed to this record.
        const late = this.responseIdTurn === turn ? this.responseId : undefined;
        const responseId = identity.responseId ?? late;
        const { responseId: _field, ...rest } = evidence;
        return { ...rest, turn, ...(responseId ? { responseId } : {}) };
    }
    childCompleted(agentId) {
        const child = this.refs.head(agentHeadName(agentId));
        if (child)
            this.children.push(child);
    }
    async afterTurn({ turn, history, modelTurn, results }) {
        this.transcript.push(structuredClone(modelTurn.assistantMessage), ...results.map((result) => structuredClone(result.message)));
        const raw = this.turnObservations.sort((a, b) => a.sequence - b.sequence).map((item) => item.ref);
        this.observations.push(...raw);
        const actions = [this.modelAction ?? await this.store.putRecord("ModelAction", jsonValue({ modelContext: this.modelContext, result: modelTurn }))];
        for (const [index, call] of modelTurn.toolCalls.entries()) {
            actions.push(await this.store.putRecord("ToolAction", jsonValue({ call, result: results[index], observation: raw[index] ?? null })));
        }
        const eventSegments = [];
        const after = await this.state(turn, "after", history);
        this.head = await recordingStage("step_commit", { agentId: this.options.agentId, trajectoryId: this.options.trajectoryId, turn }, () => this.coordinator.commit({
            agentId: this.options.agentId, trajectoryId: this.options.trajectoryId, turn,
            parent: this.head, revision: this.revision, before: this.before, after,
            context: this.context, modelContext: this.modelContext, actions, childTrajectories: this.children, eventSegments,
        }));
        await this.record("state.committed", undefined, after);
    }
    evidence() {
        return { agentId: this.options.agentId, agentRunId: this.options.trajectoryId,
            requestExecutionId: this.options.requestExecutionId, recordedAt: new Date().toISOString(), turn: this.currentTurn,
            ...(this.responseId ? { responseId: this.responseId } : {}),
            ...(this.activeContext ? { contextRef: this.activeContext, stateRef: this.before } : {}) };
    }
    record(name, payload, stateRef, evidence = this.evidence(), existingPayload) {
        if (!this.options.recordEvent)
            return Promise.resolve();
        const value = structuredClone(payload);
        this.pending = this.pending.then(async () => {
            const payloadRef = existingPayload ?? (value === undefined ? undefined : await this.store.putRecord("AgentEventPayload", value));
            await this.options.recordEvent({ type: "agent.record", name, evidence: { ...evidence, ...(stateRef ? { stateRef } : {}) },
                ...(payloadRef ? { payloadRef } : {}) });
        });
        // Synchronous loop notifications are drained at the next awaited boundary.
        void this.pending.catch(() => undefined);
        return this.pending;
    }
    /** Drain supplemental records even after failure, without advancing the Agent head. */
    async flushEvents() {
        await this.pending;
    }
    close() { this.refs?.close(); }
    state(turn, phase, history, view) {
        return this.assembler.assemble({
            agentId: this.options.agentId, trajectoryId: this.options.trajectoryId, turn, phase,
            manifest: this.manifest, predecessor: this.head, transcript: this.transcript,
            agentRevision: this.revision,
            history, observations: this.observations,
        }, view);
    }
}
