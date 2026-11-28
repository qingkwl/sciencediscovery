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
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { TOOL_SEARCH_NAME, TOOL_SEARCH_SPEC, requiredArgumentsOf } from "@sciencediscovery/tools";
import { DurableContextStore } from "@sciencediscovery/context";
import { startModelGateway, withoutWithheldNotice } from "./jiuwenswarm-model-gateway.js";
import { importSkillsToJiuwenSwarm, listJiuwenSwarmSkills, skillLoadedBy } from "./jiuwenswarm-skills.js";
import { seedHistoryText } from "./history-seed.js";
import { JiuwenSwarmTrajectory, stateProvider } from "./jiuwenswarm-trajectory.js";
import { waitForRecording } from "./recording-wait.js";
import { RunDeadlines } from "./run-deadlines.js";
import { jiuwenSwarmWebResult } from "./jiuwenswarm-web-settings.js";
import { resolveModelClientPolicy } from "@sciencediscovery/model";
import { BUNDLED_SKILL_IDS, subagentCapableParentRunTimeoutMs } from "@sciencediscovery/specialist";
import { composeSystemPrompt, DEFAULT_AGENT_IDLE_TIMEOUT_MS, DEFAULT_AGENT_TURN_TIMEOUT_MS, formatRunContract, createToolRegistry, modelEndpointFor, startPluginScope, } from "../native-agent/index.js";
/**
 * What the model is told about JiuwenSwarm's todo tools. The rest of the system prompt says to use only the
 * registered workspace tools, which these are not, and the plan guidance ScienceDiscovery normally gives
 * (the `update_plan` description, the plan context added at every step) does not apply to them.
 */
export const TODO_PLANNING_SECTION = [
    "## Planning",
    "For work with several steps, keep a task list with `todo_create` (creates or replaces the whole list), `todo_modify` (update, insert, cancel or delete items) and `todo_list`. The runtime provides them next to the workspace tools above; they are the way to plan.",
    "Mark a task in_progress before you start it and completed as soon as it is done; do not finish several at once. Keep the list short, at most 20 items, and change it when new evidence changes the approach.",
].join("\n");
/**
 * What the model is told about JiuwenSwarm's own sub-agent tools, in place of ScienceDiscovery's `task`.
 * Needed only when JiuwenSwarm's own system prompt (which documents them) is not sent.
 */
export const SUBAGENT_DELEGATION_SECTION = [
    "## Delegation",
    "For an independent, well-scoped task, delegate it with `subagent_spawn` (subagent_type, display_name, role, task_description) rather than doing it yourself. Call it several times in the same turn for tasks that may run concurrently, then a single `subagent_wait` (subagent_ids, timeout_seconds) to collect their results.",
    "A sub-agent starts with no access to this conversation or its workspace: put everything it needs in task_description.",
].join("\n");
/**
 * [windows-desktop] F6 (gap 1a, 0.B0 审查#5): what the model is told when the run
 * executes unsandboxed (Provider A). JiuwenSwarm's native subagent tools are
 * hidden, not just undocumented, so this section replaces the delegation
 * guidance and points at the sandbox plugin as the unlock.
 */
export const UNSANDBOXED_SUBAGENT_SECTION = [
    "## Delegation is restricted in this execution mode",
    "This run executes directly on the host without a sandbox, so JiuwenSwarm's own sub-agent tools (subagent_spawn, subagent_wait and their lifecycle tools) are disabled: those agents would run outside ScienceDiscovery's tools, approvals, workspace handoff and audit.",
    "Use ScienceDiscovery's own `task` tool for delegation; it runs a fully governed nested run.",
    "Installing the sandbox engine plugin (Provider B) re-enables the native sub-agent delegation.",
].join("\n");
/** ScienceDiscovery's web tools and the JiuwenSwarm tools that take their place. */
export const JIUWENSWARM_WEB_TOOLS = { web_search: "free_search (or paid_search)", web_fetch: "fetch_webpage" };
/**
 * The same JiuwenSwarm tools by name, under the ScienceDiscovery tool each one stands in for. They stand in only for
 * a tool the run has: a Session with Web access unchecked gets neither ours nor these.
 */
export const JIUWENSWARM_NATIVE_WEB_TOOLS = {
    web_search: ["free_search", "paid_search"], web_fetch: ["fetch_webpage"],
};
/**
 * JiuwenSwarm's own tools that act on the host: the model never gets them. Commands and file writes go through
 * ScienceDiscovery's `run_shell`, reads through its file tools, so they run in its sandbox and Runner, with its
 * provenance. The adapter turns away a call the model makes to one anyway.
 */
export const JIUWENSWARM_HOST_TOOLS = ["bash", "read_file", "write_file", "edit_file", "glob", "list_files", "grep", "read_pdf"];
/** What the model is told instead: JiuwenSwarm's own prompt still names those tools. */
export const HOST_TOOLS_SECTION = "Commands, scripts and file writes run in the sandbox through run_shell; read workspace files with read_file and list_files. Use workspace-relative paths in run_shell (for example, report.md): the host working directory shown by JiuwenSwarm is not accessible at the same absolute path inside the sandbox. JiuwenSwarm's bash, write_file, edit_file, glob, grep and read_pdf are not available here. skill_index may show absolute host paths for Skills, but those paths are not workspace paths: never pass them to read_file or run_shell. Load an indexed Skill with skill_tool(skill_name=<name>, relative_file_path=\"SKILL.md\"), and use skill_tool for its referenced package files. If skill_tool fails, including a filesystem lock error, immediately load that Skill with read_skill(skillId=<ScienceDiscovery skill id>) instead; use read_skill_resource for its referenced package files. Do not try to recover a failed skill_tool call by reading its host path with run_shell.";
/**
 * ScienceDiscovery's tools JiuwenSwarm's permission engine asks the user about: those that needed approval before
 * (they execute, reach a host or a Runner, or download), and every custom MCP connector tool (`mcp__...`). The
 * others are allowed. JiuwenSwarm is given this per tool; what the user then chooses ("always") is kept there.
 */
export const JIUWENSWARM_ASK_TOOLS = new Set([
    "run_shell", "execute", "environment_setup", "run_npu_job", "execution_cancel", "workspace_transfer",
    "sync_remote_workspace", "artifact_download", "arxiv_prepare_paper_download", "pubmed_prepare_paper_download",
    "pdb_prepare_structure_download",
]);
// mcp_recovered_call enforces concrete source/tool approval inside its bridge callback.
export const approvalFor = (name) => JIUWENSWARM_ASK_TOOLS.has(name) || name.startsWith("mcp__") ? "ask" : "allow";
/**
 * The resource a JiuwenSwarm approval question is checked against, for the tools whose native equivalent
 * always uses one fixed resource string (`workspace-bindings.ts`'s `requirePrivilege({ action: "code",
 * resource: "workspace-code", ... })`). A stable resource, not the call's own descriptive text, is what lets a
 * standing grant made outside a run (or "always allow this session") apply to a call JiuwenSwarm stops here too.
 * A tool not in this map keeps the call's own descriptive text as its resource, as before.
 */
const JIUWENSWARM_APPROVAL_RESOURCE = new Map([
    ["run_shell", "workspace-code"], ["execute", "workspace-code"], ["environment_setup", "workspace-code"],
    ["execution_cancel", "workspace-code"],
]);
/**
 * The arguments the question is about, when its `summary` names the tool and then the call it would make:
 * `run_shell: rm -rf out`, `mcp__custom-1__to_kelvin: {"celsius": -40}`. The approval card must carry them: for
 * run_shell the approved resource is the fixed `workspace-code`, so the command exists nowhere else on the request.
 * A summary that does not name this tool yields no detail instead of a guess.
 */
function approvalCallDetail(question) {
    const toolName = question.toolName?.trim();
    const summary = question.summary?.trim();
    if (!toolName || !summary?.startsWith(`${toolName}:`))
        return undefined;
    const detail = summary.slice(toolName.length + 1).trim();
    return detail || undefined;
}
/** JiuwenSwarm's own todo tools, left visible to the model unless planning is `update_plan`. */
export const JIUWENSWARM_TODO_TOOLS = ["todo_create", "todo_modify", "todo_list", "todo_get"];
/**
 * JiuwenSwarm's own sub-agent tools, offered in place of `task` unless
 * subagents is `task`. Recent WorkSwarm releases also expose `task_tool`;
 * hiding that alias is essential because otherwise it shadows the workspace
 * `task` bridge and only accepts JiuwenSwarm's built-in agent types.
 */
export const JIUWENSWARM_SUBAGENT_TOOLS = ["subagent_spawn", "subagent_wait", "task_tool"];
// Hide the whole native lifecycle when platform task is selected.
const JIUWENSWARM_SUBAGENT_LIFECYCLE_TOOLS = [
    ...JIUWENSWARM_SUBAGENT_TOOLS, "subagent_list", "subagent_send_input", "subagent_close", "subagent_resume",
];
/** Selected by SCIENCE_AGENT_EXECUTOR=jiuwenswarm; direct API startup without that setting uses native. */
export function jiuwenSwarmConfigFromEnv(env = process.env) {
    if (env.SCIENCE_AGENT_EXECUTOR?.trim() !== "jiuwenswarm")
        return undefined;
    const adapterUrl = env.SCIENCE_AGENT_ADAPTER_URL?.trim();
    if (!adapterUrl)
        throw new Error("SCIENCE_AGENT_EXECUTOR=jiuwenswarm requires SCIENCE_AGENT_ADAPTER_URL");
    const subagents = env.SCIENCE_AGENT_JIUWENSWARM_SUBAGENTS?.trim() || "task";
    if (subagents !== "task" && subagents !== "jiuwenswarm") {
        throw new Error("SCIENCE_AGENT_JIUWENSWARM_SUBAGENTS must be task or jiuwenswarm");
    }
    return {
        adapterUrl: adapterUrl.replace(/\/+$/, ""),
        ...(env.SCIENCE_AGENT_ADAPTER_TOKEN?.trim() ? { adapterToken: env.SCIENCE_AGENT_ADAPTER_TOKEN.trim() } : {}),
        ...(env.SCIENCE_AGENT_JIUWENSWARM_PLANNING?.trim() === "update_plan" ? { planning: "update_plan" } : {}),
        ...(env.SCIENCE_AGENT_JIUWENSWARM_PROMPT?.trim() === "replace" ? { prompt: "replace" } : {}),
        ...(env.SCIENCE_AGENT_JIUWENSWARM_TOOLS?.trim() === "ours" ? { tools: "ours" } : {}),
        ...(env.SCIENCE_AGENT_JIUWENSWARM_SKILLS?.trim() === "ours" ? { skills: "ours" } : {}),
        ...(env.SCIENCE_AGENT_SKILL_SELECTION?.trim() === "desktop" ? { skillSelection: "desktop" } : {}),
        subagents,
    };
}
export function createJiuwenSwarmAgentFactory(config) {
    return (options) => new JiuwenSwarmAgent(config, options);
}
class JiuwenSwarmAgent {
    config;
    options;
    listeners = new Set();
    usage = new UsageReporter(event => this.emit(event));
    controller = new AbortController();
    approvalDeliveryError;
    executed = false;
    /** The run's skills installed in JiuwenSwarm: JiuwenSwarm's name for each, and back. */
    skillNames = new Map();
    skillIds = new Map();
    /** Skill ids that are enabled in JiuwenSwarm's global switch. Used to keep disabled skills out of the read_skill fallback. */
    enabledSkillIds = new Set();
    /** Loads a skill the ScienceDiscovery way, so that what depends on a loaded skill (create_skill) sees it. */
    loadSkill;
    /** The run's trajectory (model inputs, answers, tool observations), recorded as the built-in loop records it. */
    trajectory;
    /** The run's turn and idle deadlines, as the built-in loop keeps them. */
    deadlines;
    lastProgressAt = Date.now();
    lastProgressSource = "setup";
    /** Waits begun before the deadlines exist (an approval asked while the run is set up). */
    pendingWaits = 0;
    constructor(config, options) {
        this.config = config;
        this.options = options;
    }
    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    abort() {
        this.controller.abort();
    }
    /** The run waits on something outside it (an approval): its deadlines stand still meanwhile. */
    beginExternalWait() {
        if (this.deadlines)
            return this.deadlines.beginWait();
        this.pendingWaits += 1;
        let released = false;
        return () => {
            if (released)
                return;
            released = true;
            this.pendingWaits = Math.max(0, this.pendingWaits - 1);
        };
    }
    async prompt(text) {
        await this.execute(text);
    }
    emit(event) {
        this.markProgress(`agent:${event.type}`);
        const evidence = this.trajectory?.evidence(event);
        const tagged = evidence ? { ...event, evidence } : event;
        for (const listener of this.listeners)
            listener(tagged);
    }
    markProgress(source) {
        this.lastProgressAt = Date.now();
        this.lastProgressSource = source;
        this.deadlines?.progress();
    }
    logGatewayProgress(phase, gateway) {
        console.info(`[gateway-progress] ${JSON.stringify({ phase, sessionId: this.options.sessionId,
            agentId: this.options.versioning?.agentId, idleMs: Date.now() - this.lastProgressAt,
            lastProgressSource: this.lastProgressSource, activeModelRequests: gateway.diagnostics() })}`);
    }
    async execute(text) {
        if (this.executed)
            throw new Error("Agent handle has already been executed");
        this.executed = true;
        const durable = new DurableContextStore({
            history: this.options.gatewayHistory,
            ...(this.options.runContract ? { runContract: this.options.runContract } : {}),
        });
        const runtimeOptions = await this.skillRuntimeOptions();
        const plugins = await startPluginScope(runtimeOptions, durable, this.controller.signal);
        const trajectory = new JiuwenSwarmTrajectory(this.options);
        this.trajectory = trajectory;
        // The same registry the native loop dispatches through: output guard, detail sanitisation,
        // neutralised untrusted content, loop protection, the standard error shape.
        // Recovery multiplexes several source/tool identities through one tool. Enforce
        // approval at dispatch with the concrete identity, never an adapter-wide
        // remembered grant for the generic mcp_recovered_call name.
        const mcpReadiness = runtimeOptions.mcpReadiness;
        const registryOptions = mcpReadiness ? {
            ...runtimeOptions,
            mcpReadiness: {
                ...mcpReadiness,
                invoke: async (sourceId, toolId, input, signal, toolCallId) => {
                    signal?.throwIfAborted();
                    const resource = `mcp__${sourceId.replace(/[^A-Za-z0-9_-]/g, "_")}__${toolId.replace(/[^A-Za-z0-9_-]/g, "_")}`;
                    const release = this.beginExternalWait();
                    let decision;
                    try {
                        decision = await this.options.requestApproval?.({
                            description: { kind: "mcp-tool", recovered: true, sourceId, toolId },
                            resource, summary: `Call repaired MCP tool ${sourceId}/${toolId}`, toolCallId,
                        }, signal) ?? "deny";
                    }
                    finally {
                        release();
                    }
                    signal?.throwIfAborted();
                    if (decision === "deny")
                        throw new Error(`MCP recovery approval denied: ${sourceId}/${toolId}`);
                    return mcpReadiness.invoke(sourceId, toolId, input, signal, toolCallId);
                },
            },
        } : runtimeOptions;
        const registry = createToolRegistry(registryOptions, plugins, durable, {
            onProgress: (call, chunk) => this.emit({ type: "tool_execution_progress", toolCallId: call.id, toolName: call.name, chunk }),
            ...(trajectory.enabled ? { recordResult: (input) => trajectory.observe(input) } : {}),
        });
        const tools = new Map(registry.values().map((tool) => [tool.name, tool]));
        await offerDeferredTools(registry, tools, this.controller.signal);
        // The components a turn's state snapshot is checkpointed against. They exist only once the
        // registry and the plugin scope do, which is why this is wired here rather than at construction.
        trajectory.useStateProviders({
            providers: [
                stateProvider("context.durable", () => durable.snapshot()),
                stateProvider("tools", () => ({ snapshot: registry.snapshot(), promptSections: registry.promptSections(), specs: registry.visibleSpecs() })),
                ...plugins.contributions.flatMap((item) => item.stateProviders),
            ],
            scope: this.options.sessionId,
            signal: this.controller.signal,
        });
        // With JiuwenSwarm's own todo tools the model does not also get ours. Only in place of ours: a run whose Plan
        // plugin is switched off has no update_plan, and then no planning tool of either kind.
        const jiuwenSwarmPlans = (this.config.planning ?? "todo") === "todo" && Boolean(this.options.planStore) && tools.has("update_plan");
        if (jiuwenSwarmPlans)
            tools.delete("update_plan");
        // Web search and page fetching are JiuwenSwarm's own when its tools are in use, but only in place of ours: a run
        // without web_search or web_fetch (Web access unchecked for the Session) must not get JiuwenSwarm's either.
        const allJiuwenSwarmTools = (this.config.tools ?? "jiuwenswarm") === "jiuwenswarm";
        const hiddenWebTools = allJiuwenSwarmTools
            ? Object.entries(JIUWENSWARM_NATIVE_WEB_TOOLS).flatMap(([ours, theirs]) => tools.has(ours) ? [] : theirs) : [];
        if (allJiuwenSwarmTools)
            for (const name of Object.keys(JIUWENSWARM_WEB_TOOLS))
                tools.delete(name);
        // With JiuwenSwarm's own sub-agent tools the model does not also get ours: those sub-agents run inside
        // JiuwenSwarm, with none of ScienceDiscovery's tools, sandbox, handoff or provenance.
        // [windows-desktop] F6 (gap 1a, 0.B0 审查#5): on an unsandboxed provider those
        // native sub-agent tools are withheld entirely — a JiuwenSwarm-internal agent
        // would bypass ScienceDiscovery's approvals and audit. ScienceDiscovery's own
        // `task` bridge stays available.
        const jiuwenSwarmSubagents = allJiuwenSwarmTools && this.options.unsandboxedExecution !== true
            && (this.config.subagents ?? "task") === "jiuwenswarm" && tools.has("task");
        if (jiuwenSwarmSubagents)
            tools.delete("task");
        await this.installSkills(tools, allJiuwenSwarmTools);
        this.loadSkill = (id) => {
            void registry.execute({ id: randomUUID(), name: "read_skill", args: { skillId: id } }, this.controller.signal)
                .catch(() => undefined);
        };
        const bridgeToken = randomUUID();
        const announcements = new ToolAnnouncements();
        const transcript = new Transcript();
        const bridge = await startBridge(registry, tools, bridgeToken, this.controller.signal, (event) => this.emit(event), announcements, transcript, this.config.toolAnnouncementTimeoutMs);
        // JiuwenSwarm only speaks OpenAI chat completions; the model itself may not (see the gateway).
        const policy = resolveModelClientPolicy();
        const endpoint = modelEndpointFor(this.options);
        await trajectory.start({
            executor: "jiuwenswarm",
            model: { model: endpoint.model, apiProtocol: endpoint.apiProtocol, apiVariant: endpoint.apiVariant },
            tools: [...tools.values()].map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters })),
            config: { planning: this.config.planning ?? "todo", prompt: this.config.prompt ?? "prepend", tools: this.config.tools ?? "jiuwenswarm", skills: this.config.skills ?? "jiuwenswarm", subagents: this.config.subagents ?? "task" },
        }).catch((error) => console.warn(`[jiuwenswarm-agent] trajectory not recorded: ${error instanceof Error ? error.message : String(error)}`));
        const modelGateway = await startModelGateway(endpoint, policy, this.controller.signal, this.config.modelStreamer, trajectory.enabled ? {
            request: (input) => trajectory.modelRequest(input),
            // The gateway names each call before it sends it and passes the identity back here, so this
            // call's record carries its own id even when another call is in flight (#1133).
            completed: (turn, history, call) => trajectory.modelCompleted(turn, history, call),
        } : undefined, { progress: () => this.markProgress("model:upstream"), beforeTurn: () => this.emit({ type: "turn_start" }),
            onUsage: usage => this.usage.record(usage),
            // Only the run's own instance has the output-recovery boundary; JiuwenSwarm's sub-agents do not.
            recoversWithheldCalls: !jiuwenSwarmSubagents,
            // A call that leaves out an argument its tool cannot run without is withheld and re-issued
            // by the model, instead of the run carrying a failed card for a call that never ran.
            requiredArguments: requiredArgumentsOf(registry.values()) });
        const deadlines = new RunDeadlines(this.options.runTimeoutMs ?? DEFAULT_AGENT_TURN_TIMEOUT_MS, this.options.runIdleTimeoutMs ?? DEFAULT_AGENT_IDLE_TIMEOUT_MS, () => {
            this.logGatewayProgress(`${deadlines.expired ?? "unknown"}_deadline_expired`, modelGateway);
            this.controller.abort();
        });
        this.deadlines = deadlines;
        for (let wait = 0; wait < this.pendingWaits; wait += 1)
            deadlines.beginWait();
        deadlines.start();
        this.markProgress("run_started");
        const progressTimer = process.env.SCIENCE_AGENT_TRACE_GATEWAY_PROGRESS === "1"
            ? setInterval(() => this.logGatewayProgress("heartbeat", modelGateway), 30_000) : undefined;
        progressTimer?.unref();
        try {
            const finalText = await this.stream(text, tools, bridge.url, bridgeToken, announcements, transcript, modelGateway, jiuwenSwarmPlans, jiuwenSwarmSubagents, hiddenWebTools);
            this.controller.signal.throwIfAborted();
            // An unrecovered partial answer must never be reported as completed.
            if (modelGateway.lastTurn()?.truncated) {
                this.emit({ type: "turn_truncated" });
                throw new Error("Swarm ended with an unrecovered output limit");
            }
            // Nor may a run end on a response whose tool calls were withheld for invalid arguments.
            if (modelGateway.lastFailure())
                throw new Error("Swarm ended on withheld tool calls");
            return {
                finalMessages: [{ role: "user", content: text }, ...transcript.finish(finalText).map((message) => modelGateway.restore(message))],
            };
        }
        catch (error) {
            // Keep "timeout" in these errors: classifySubagentFailure matches /timeout/i for a sub-agent's timed_out status.
            if (deadlines.expired)
                throw deadlines.error();
            if (this.approvalDeliveryError)
                throw this.approvalDeliveryError;
            if (this.controller.signal.aborted)
                throw new Error("Agent run cancelled");
            const modelFailure = modelGateway.lastFailure();
            if (modelFailure)
                throw new Error(`Model returned invalid tool arguments (tools: ${modelFailure.tools.join(", ") || "unknown"})${modelFailure.recoveryAttempts
                    ? ` after ${modelFailure.recoveryAttempts} recovery attempts` : ""}; gateway request ${modelFailure.requestId}`, { cause: error });
            const last = modelGateway.lastTurn();
            if (last?.truncated) {
                const detail = { code: "output_recovery_exhausted", kind: last.toolCalls ? "tool_arguments"
                        : last.text.trim() ? "partial_answer" : "reasoning_only", maxTokens: policy.maxTokens,
                    recoveryAttempts: last.recoveryAttempts ?? 0, currentTurnToolsExecuted: false,
                    priorArtifactsPreserved: true };
                throw new Error(`Output limit recovery stopped: ${JSON.stringify(detail)}. Inspect existing artifacts before delegating again.`, { cause: error });
            }
            console.warn(`[jiuwenswarm-agent] run of ${this.options.sessionId} failed: ${error instanceof Error ? error.message : String(error)}`);
            if (error instanceof Error) {
                const cause = error.cause;
                console.warn(`[jiuwenswarm-agent] transport diagnostic: ${JSON.stringify({ name: error.name, stack: error.stack, cause: cause && { name: cause.name, code: cause.code, message: cause.message } })}`);
            }
            throw error;
        }
        finally {
            if (progressTimer)
                clearInterval(progressTimer);
            deadlines.stop();
            await bridge.close();
            await modelGateway.close();
            // The recorder drains/closes in its own queue. Cancellation must not wait for that queue.
            const draining = trajectory.finish().catch((error) => console.warn(`[jiuwenswarm-agent] trajectory not committed: ${error instanceof Error ? error.message : String(error)}`));
            await waitForRecording(draining, this.controller.signal).catch(() => undefined);
            await plugins.dispose();
        }
    }
    usesJiuwenSwarmSkills() {
        return (this.config.skills ?? "jiuwenswarm") === "jiuwenswarm"
            && (this.config.tools ?? "jiuwenswarm") === "jiuwenswarm"
            && (this.config.prompt ?? "prepend") === "prepend";
    }
    /** Filter before plugins register readers, resources and skill-dependent tools. */
    async skillRuntimeOptions() {
        const skills = this.options.skills ?? [];
        if (!this.usesJiuwenSwarmSkills()) {
            this.enabledSkillIds = new Set(skills.map((skill) => skill.id));
            return this.options;
        }
        if (!skills.length)
            return this.options;
        // A failed read must not silently turn off skills or bypass the global switches.
        const installed = await listJiuwenSwarmSkills(this.config, this.controller.signal);
        const installedById = new Map(installed.flatMap((skill) => skill.skillId ? [[skill.skillId, skill]] : []));
        this.enabledSkillIds = new Set(skills.filter((skill) => {
            const existing = installedById.get(skill.id);
            if (existing)
                return existing.enabled;
            // Bundled skills default to enabled until JiuwenSwarm has a saved switch.
            // Managed Desktop packages still require explicit enable; Library references
            // and non-Desktop runs retain first-use import.
            return BUNDLED_SKILL_IDS.some((id) => id === skill.id)
                || this.config.skillSelection !== "desktop" || skill.importOnRun === true;
        }).map((skill) => skill.id));
        return { ...this.options, skills: skills.filter((skill) => this.enabledSkillIds.has(skill.id)) };
    }
    /**
     * With JiuwenSwarm's skill mechanism, the run's skills are installed there and the model loads them with its
     * `skill_tool`; retain ScienceDiscovery's skill readers as a fallback when JiuwenSwarm's loader fails.
     * The product prompt catalogs only skills that could not be installed, avoiding duplicate listings.
     */
    async installSkills(tools, allJiuwenSwarmTools) {
        const skills = this.options.skills ?? [];
        const root = this.options.skillPackagesRoot;
        if (!this.usesJiuwenSwarmSkills() || !allJiuwenSwarmTools || !root || !tools.has("read_skill"))
            return;
        const skillsToStage = skills.filter((skill) => this.enabledSkillIds.has(skill.id));
        const imported = skillsToStage.length && root
            ? await importSkillsToJiuwenSwarm(this.config, skillsToStage.map(({ hash, id }) => ({ hash, id })), root, this.controller.signal)
            : new Map();
        for (const [id, name] of imported) {
            this.skillNames.set(id, name);
            this.skillIds.set(name, id);
        }
    }
    /** A tool's description as JiuwenSwarm's model reads it: skills it loads with skill_tool, under their names there. */
    describe(tool) {
        const creator = this.skillNames.get("skill-creator");
        return creator && tool.name === "create_skill"
            ? tool.description.replace("load skill-creator with read_skill", `load the ${creator} skill with skill_tool`)
            : tool.description;
    }
    /** A JiuwenSwarm call that loaded one of the run's skills counts as loading it here. */
    recordSkillLoad(call) {
        if (call.failed || !this.loadSkill)
            return;
        const id = skillLoadedBy(call, this.skillIds);
        if (id)
            this.loadSkill(id);
    }
    /**
     * JiuwenSwarm's permission engine stopped a call and asks: put it to the user as a ScienceDiscovery approval and
     * send the answer back. The run waits in JiuwenSwarm meanwhile. Without a way to ask, the call is denied.
     */
    answerApproval(question) {
        // A stale adapter must not mint a generic recovery grant. Concrete recovery
        // approval is checked inside the bridge even if its engine caches a decision.
        const ask = question.toolName === "mcp_recovered_call" ? undefined : this.options.requestApproval;
        // A stable resource for a tool whose native equivalent always checks one fixed resource (run_shell and
        // the rest of JIUWENSWARM_APPROVAL_RESOURCE), so a standing grant applies here too. Any other tool the
        // adapter matched to its call is named by the tool itself: JiuwenSwarm's own question text ("mcp_sci_…
        // （当前模式默认需确认） > 选择「会话内记住」…") is internal wording that the card would show verbatim.
        const resource = (question.toolName && (JIUWENSWARM_APPROVAL_RESOURCE.get(question.toolName) ?? question.toolName))
            ?? question.resource ?? question.summary ?? "tool call";
        // What the user is actually approving: the command or arguments the tool would run. `summary` is the only
        // place JiuwenSwarm puts them, and the structured card replaces that sentence, so keep them as fields.
        const detail = approvalCallDetail(question);
        // A human can take arbitrarily long to answer; that wait must not itself look "stalled".
        const release = this.beginExternalWait();
        const decided = (ask
            ? ask({ description: {
                    ...(detail ? { detail } : {}),
                    kind: "tool-call",
                    ...(question.toolName ? { toolName: question.toolName } : {}),
                },
                resource, summary: question.summary ?? question.resource ?? "tool call",
                ...(question.toolCallId ? { toolCallId: question.toolCallId } : {}) }, this.controller.signal)
            : Promise.resolve("deny"));
        void decided.catch(() => "deny").then(async (decision) => {
            for (let attempt = 0;; attempt += 1) {
                this.controller.signal.throwIfAborted();
                let response;
                try {
                    response = await (this.config.fetch ?? fetch)(`${this.config.adapterUrl}/agent/approvals/${encodeURIComponent(question.id)}`, {
                        method: "POST",
                        signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(10_000)]),
                        headers: { "content-type": "application/json", ...(this.config.adapterToken ? { authorization: `Bearer ${this.config.adapterToken}` } : {}) },
                        body: JSON.stringify({ decision }),
                    });
                }
                catch (error) {
                    if (this.controller.signal.aborted || attempt >= 2)
                        throw error;
                    const cause = error?.cause;
                    console.warn(`[jiuwenswarm-agent] approval transport retry ${attempt + 1}/2 question=${question.id} cause=${cause?.code ?? (error instanceof Error ? error.name : "unknown")}`);
                    await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
                    continue;
                }
                if (response.ok)
                    break;
                // Adapter 502 means an uncertain downstream delivery: do not replay it.
                // Only retry HTTP service availability failures using the same decision ID.
                if (![503, 504].includes(response.status) || attempt >= 2)
                    throw new Error(`HTTP ${response.status}`);
                await response.body?.cancel();
                await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
            }
        }).catch((error) => {
            console.warn(`[jiuwenswarm-agent] could not answer JiuwenSwarm's approval question ${question.id}: ${error instanceof Error ? error.message : String(error)}`);
            if (!this.controller.signal.aborted) {
                this.approvalDeliveryError = new Error("JiuwenSwarm approval delivery failed; the run cannot safely resume.");
                this.controller.abort();
            }
        }).finally(release);
    }
    /** JiuwenSwarm's own web search and fetching, recorded in the memory graph as ours are. Fire and forget. */
    recordWeb(call) {
        const record = this.options.recordWebResult;
        if (!record || call.failed)
            return;
        const result = jiuwenSwarmWebResult(call.name, (call.args ?? {}), call.output);
        if (result)
            void record(call.id, result).catch(() => undefined);
    }
    /** JiuwenSwarm's todo list, as the run's plan: what the plan panel and the API's plan events read. */
    async recordPlan(store, items, toolCallId) {
        const plan = items.flatMap(({ content, status }) => {
            const step = content.trim().slice(0, 1_000);
            // A cancelled todo is not part of the plan; the plan knows pending, in progress and completed.
            return step && (status === "pending" || status === "in_progress" || status === "completed")
                ? [{ step, status: status }] : [];
        }).slice(0, 20);
        try {
            await store.update({ plan }, toolCallId, this.controller.signal);
        }
        catch (error) {
            console.warn(`[jiuwenswarm-agent] could not record the plan: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async stream(text, tools, bridgeUrl, bridgeToken, announcements, transcript, modelGateway, jiuwenSwarmPlans = false, jiuwenSwarmSubagents = false, hiddenWebTools = []) {
        const { config: model } = this.options;
        const toolNames = new Set(tools.keys());
        // The same system prompt the native loop would send: the model is tuned to it.
        // The run contract changes every turn; it is sent apart and put last, so that what comes before it is the
        // same on every request (and can be cached by the provider).
        // Skills installed in JiuwenSwarm are listed by its prompt; the product prompt lists only those that were not.
        const composed = composeSystemPrompt({ ...this.options, runContract: undefined }, toolNames, toolNames.has("read_skill") ? (this.options.skills ?? []).filter((skill) => !this.skillNames.has(skill.id) && this.enabledSkillIds.has(skill.id)) : []).systemPrompt;
        const runContract = this.options.runContract ? formatRunContract(this.options.runContract) : undefined;
        // Appended after JiuwenSwarm's own prompt, its todo section already says how to plan; only when its prompt is
        // replaced does the model need to be told about the todo tools here.
        const keepJiuwenSwarmPrompt = (this.config.prompt ?? "prepend") === "prepend";
        const allJiuwenSwarmTools = (this.config.tools ?? "jiuwenswarm") === "jiuwenswarm";
        // With JiuwenSwarm's tools the model is no longer limited to the ones registered here, and the rules about
        // web content name JiuwenSwarm's web tools.
        const ours = allJiuwenSwarmTools
            ? Object.entries(JIUWENSWARM_WEB_TOOLS).reduce((text, [mine, theirs]) => text.replaceAll(mine, theirs), composed.replace("Use only the registered workspace tools. ", ""))
            : composed;
        const withHostRule = allJiuwenSwarmTools ? `${ours}\n\n${HOST_TOOLS_SECTION}` : ours;
        const replacementSections = keepJiuwenSwarmPrompt ? [] : [
            ...(jiuwenSwarmPlans ? [TODO_PLANNING_SECTION] : []),
            ...(jiuwenSwarmSubagents ? [SUBAGENT_DELEGATION_SECTION] : []),
        ];
        const delegationRule = jiuwenSwarmSubagents ? [] : [toolNames.has("task")
                ? "Delegation for this run uses only the platform task tool. Swarm-native subagent tools are unavailable; ignore any generic instructions recommending them. Use task to delegate and collect results."
                : "Delegation is unavailable for this run. Ignore any generic instructions recommending Swarm-native subagent tools; complete the assigned work with the available tools."];
        const systemPromptSeed = this.options.seedModelContext && this.options.gatewayHistory?.length
            ? seedHistoryText(this.options.gatewayHistory) : "";
        const clarificationRule = "Ask clarification questions in a regular assistant message. Include any choices the user needs and end the turn so they can reply in chat.";
        const systemPrompt = [systemPromptSeed, withHostRule, clarificationRule, ...replacementSections,
            ...(this.options.unsandboxedExecution === true ? [UNSANDBOXED_SUBAGENT_SECTION] : []), ...delegationRule]
            .filter(Boolean).join("\n\n");
        const nativeToolNames = [...(jiuwenSwarmPlans ? JIUWENSWARM_TODO_TOOLS : []), ...(jiuwenSwarmSubagents ? JIUWENSWARM_SUBAGENT_TOOLS : [])];
        const response = await (this.config.fetch ?? fetch)(`${this.config.adapterUrl}/agent/runs`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                ...(this.config.adapterToken ? { authorization: `Bearer ${this.config.adapterToken}` } : {}),
            },
            body: JSON.stringify({
                sessionId: this.options.sessionId,
                runId: this.options.versioning?.trajectoryId,
                agentId: this.options.versioning?.agentId,
                sessionKey: jiuwenSwarmSessionKey(this.options),
                prompt: text,
                systemPrompt,
                systemPromptMode: keepJiuwenSwarmPrompt ? "prepend" : "replace",
                ...(runContract ? { systemPromptTail: runContract } : {}),
                cwd: this.options.workspaceRoot,
                // The adapter's proxy forwards to this loopback gateway, which speaks the model's own protocol.
                model: { model: model.model, baseUrl: modelGateway.url, apiKey: modelGateway.token, provider: "OpenAI" },
                ...(nativeToolNames.length ? { nativeTools: nativeToolNames } : {}),
                jiuwenSwarmTools: allJiuwenSwarmTools ? "all" : "listed",
                hiddenJiuwenSwarmTools: [
                    // JiuwenSwarm workswarm0.2.6 registers this name in ask_user_rail.py.
                    "ask_user",
                    ...(allJiuwenSwarmTools ? JIUWENSWARM_HOST_TOOLS : []),
                    ...hiddenWebTools,
                    ...(!jiuwenSwarmPlans ? JIUWENSWARM_TODO_TOOLS : []),
                    ...(!jiuwenSwarmSubagents ? JIUWENSWARM_SUBAGENT_LIFECYCLE_TOOLS : []),
                ],
                // A parent `task` call remains open while its child executes. The
                // parent's active-run deadline pauses for that wait, but JiuwenSwarm's
                // MCP deadline does not; it must outlast the largest allowed child.
                ...((this.options.runTimeoutMs || tools.has("task")) ? { toolTimeoutSeconds: Math.ceil(Math.max(this.options.runTimeoutMs ?? 0, tools.has("task") ? subagentCapableParentRunTimeoutMs() : 0) / 1000) } : {}),
                ...(tools.has("configuration") ? { configurationWaitTimeoutSeconds: 24 * 60 * 60 + 60 } : {}),
                tools: [...tools.values()].map((tool) => ({
                    name: tool.name, description: this.describe(tool), inputSchema: tool.parameters, approval: approvalFor(tool.name),
                })),
                bridge: { url: bridgeUrl, token: bridgeToken },
            }),
            signal: this.controller.signal,
        });
        if (!response.ok || !response.body) {
            throw new Error(`adapter refused the run: HTTP ${response.status} ${await response.text().catch(() => "")}`.trim());
        }
        const planStore = this.options.planStore;
        const translator = new EventTranslator((event) => this.emit(event), announcements, transcript, new Set(nativeToolNames), planStore ? (items, toolCallId) => this.recordPlan(planStore, items, toolCallId) : undefined, (call) => {
            this.recordWeb(call);
            this.recordSkillLoad(call);
            void this.trajectory?.observe({ call: { args: call.args ?? {}, id: call.id, name: call.name }, content: call.output, isError: call.failed }).catch(() => undefined);
        });
        let finalText = "";
        let failure;
        let receivedTerminal = false;
        for await (const line of ndjson(response.body)) {
            if (receivedTerminal)
                throw new Error("Swarm adapter sent data after its terminal result");
            this.markProgress("event" in line ? `adapter:${line.event.type}` : "adapter:done");
            if ("event" in line && line.event.type === "permission.required")
                this.answerApproval(line.event.request);
            if ("event" in line && line.event.type === "user_input.required") {
                const request = line.event.request;
                const question = typeof request?.question === "string" ? request.question.trim() : "";
                if (!question) {
                    throw new Error("The assistant requested an interactive reply. Please send the clarification as a new chat message.");
                }
                // Publish the question through the normal chat stream and close the adapter's suspended turn.
                const responseId = randomUUID();
                const turn = typeof line.event.turn === "number" ? line.event.turn : 0;
                translator.handle({ type: "assistant.response.started", responseId, turn });
                translator.handle({ type: "assistant.delta", responseId, delta: question });
                translator.handle({ type: "assistant.response.settled", responseId, turn });
                finalText = question;
                receivedTerminal = true;
                break;
            }
            if ("done" in line) {
                receivedTerminal = true;
                finalText = line.done.finalText;
                if (line.done.cancelled || line.done.status === "cancelled")
                    failure ??= "Swarm run was cancelled";
                if (line.done.status === "failed")
                    failure ??= "Swarm run failed without an error event";
                if (line.done.status !== undefined && !["completed", "failed", "cancelled"].includes(line.done.status)) {
                    failure ??= "Swarm adapter returned an invalid terminal status";
                }
            }
            else if (line.event.type === "run.failed")
                failure = String(line.event.error);
            else
                translator.handle(line.event);
        }
        if (failure !== undefined)
            throw new Error(failure);
        if (!receivedTerminal)
            throw new Error("Swarm adapter stream ended without a terminal result");
        this.usage.finish();
        return finalText;
    }
}
/**
 * The tool calls the adapter says the model made, in order. The bridge runs a tool only when
 * JiuwenSwarm calls it over MCP, which can beat the adapter's own report of the same call to
 * this process. Waiting for that report keeps the run's events in the order the native agent
 * produces them (the response of the model call first, then the tool) and lets the tool run
 * under the id the model gave it.
 */
class ToolAnnouncements {
    pending = [];
    waiters = new Set();
    /** Every call announced so far, in the order the model made them, with the response it belongs to. */
    all = [];
    batch = 0;
    failedBeforeBridge = new Set();
    /** A new model response begins: its calls form the next batch. */
    newResponse() {
        this.batch += 1;
    }
    announce(call) {
        if (this.all.some((item) => item.id === call.id))
            return;
        this.all.push({ args: (call.args ?? {}), batch: this.batch, id: call.id, name: call.name, seq: this.all.length });
        this.pending.push(call);
        for (const wake of [...this.waiters])
            wake();
    }
    /** Only an unclaimed call may be completed by the Swarm fallback reporter. */
    failUnclaimed(id) {
        const index = this.pending.findIndex((call) => call.id === id);
        if (index < 0)
            return undefined;
        const [call] = this.pending.splice(index, 1);
        this.failedBeforeBridge.add(id);
        return call;
    }
    /**
     * Take the first announced call with this name whose arguments are the ones JiuwenSwarm passed on.
     * JiuwenSwarm fills schema defaults into the arguments and drops empty arrays and objects, so
     * "the same call" means: every argument the model sent is there unchanged, or was empty and is
     * absent. The caller then runs the tool with the announced (model's own) arguments.
     */
    async claim(name, given, timeoutMs = 5_000) {
        const deadline = Date.now() + timeoutMs;
        for (;;) {
            const index = this.pending.findIndex((call) => call.name === name && sameCall(call.args, given));
            if (index >= 0) {
                const [call] = this.pending.splice(index, 1);
                return { args: call.args, id: call.id, input: call.input };
            }
            const remaining = deadline - Date.now();
            if (remaining <= 0)
                return undefined;
            await new Promise((resolve) => {
                const wake = () => { this.waiters.delete(wake); clearTimeout(timer); resolve(); };
                const timer = setTimeout(wake, remaining);
                this.waiters.add(wake);
            });
        }
    }
}
/**
 * Keeps the native loop's scheduling rules when JiuwenSwarm calls the tools of one model response
 * side by side. Per response, the registry decides which calls may overlap (`isConcurrencySafe`;
 * anything not declared safe runs alone) and which are superseded by another call of the same
 * response (batch policies, e.g. two `update_plan`). A call therefore waits for the calls the model
 * made before it that it may not overlap with, in the order the model made them.
 */
class ToolScheduler {
    registry;
    announcements;
    graceMs;
    prepared = new Map();
    arrived = new Set();
    finished = new Set();
    constructor(registry, announcements, 
    /** How long to wait for an earlier call that never reaches the bridge. */
    graceMs = 5_000) {
        this.registry = registry;
        this.announcements = announcements;
        this.graceMs = graceMs;
    }
    async run(call, signal, started) {
        const own = this.announcements.all.find((item) => item.id === call.id);
        // A call nobody announced (see claim) has no place in an order: run it as it comes.
        if (!own) {
            signal.throwIfAborted();
            started();
            return await this.registry.execute(call, signal);
        }
        this.arrived.add(call.id);
        try {
            // Announcements of one response arrive back to back; let them all in before deciding.
            await new Promise((resolve) => setImmediate(resolve));
            const batchCalls = this.announcements.all.filter((item) => item.batch === own.batch);
            let prepared = this.prepared.get(own.batch);
            if (!prepared) {
                prepared = this.registry.prepareBatch(batchCalls.map(({ args, id, name }) => ({ args, id, name })));
                this.prepared.set(own.batch, prepared);
            }
            const exclusive = (item) => 
            // Fail closed like the native loop: only an explicit "parallel" may overlap.
            prepared.executionMode?.({ args: item.args, id: item.id, name: item.name }) !== "parallel";
            const mine = exclusive(own);
            for (const earlier of batchCalls.filter((item) => item.seq < own.seq && (mine || exclusive(item)))) {
                const deadline = Date.now() + this.graceMs;
                while (!this.finished.has(earlier.id) && !this.announcements.failedBeforeBridge.has(earlier.id)
                    && (this.arrived.has(earlier.id) || Date.now() < deadline)) {
                    if (signal.aborted)
                        break;
                    await new Promise((resolve) => setTimeout(resolve, 10));
                }
            }
            signal.throwIfAborted();
            started();
            return await prepared.execute({ args: call.args, id: call.id, name: call.name }, signal);
        }
        finally {
            this.finished.add(call.id);
        }
    }
}
const isEmptyContainer = (value) => (Array.isArray(value) && value.length === 0)
    || (value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0);
function sameCall(announced, given) {
    return Object.entries(announced ?? {}).every(([key, value]) => key in given ? JSON.stringify(given[key]) === JSON.stringify(value) : isEmptyContainer(value));
}
/** The model-facing transcript of a run, in the shape the native agent leaves behind. */
class Transcript {
    messages = [];
    text = "";
    pending;
    delta(text) {
        this.text += text;
    }
    /** A model call ended; what it said is held until we know whether it also called tools. */
    settled() {
        this.flush();
        this.pending = { content: this.text };
        this.text = "";
    }
    toolCall(id, name, input) {
        this.pending ??= { content: "" };
        (this.pending.tool_calls ??= []).push({ id, type: "function", function: { name, arguments: input } });
    }
    toolResult(id, name, content) {
        this.flush();
        this.messages.push({ role: "tool", tool_call_id: id, name, content });
    }
    flush() {
        if (!this.pending)
            return;
        this.messages.push({ role: "assistant", ...this.pending });
        this.pending = undefined;
    }
    /** Close the run. A model call that answered without streaming leaves `finalText` as its answer. */
    finish(finalText) {
        if (this.text)
            this.settled();
        if (!this.pending && finalText && !this.messages.some((message) => message.role === "assistant" && message.content === finalText)) {
            this.pending = { content: finalText };
        }
        this.flush();
        return this.messages;
    }
}
/**
 * Turns the adapter's run events into the agent events the run consumes. Tool
 * Platform events normally come from the bridge. Pre-bridge failures have no
 * bridge reporter, so the Swarm event is their authoritative fallback.
 */
class EventTranslator {
    emit;
    announcements;
    transcript;
    nativeTools;
    onPlan;
    onNativeResult;
    constructor(emit, announcements, transcript, 
    /** JiuwenSwarm's own tools the model may call; they run there, so their events come from here. */
    nativeTools = new Set(), onPlan, 
    /** Called when one of JiuwenSwarm's own tools has finished (to record its web results). */
    onNativeResult) {
        this.emit = emit;
        this.announcements = announcements;
        this.transcript = transcript;
        this.nativeTools = nativeTools;
        this.onPlan = onPlan;
        this.onNativeResult = onNativeResult;
    }
    lastNativeCall = "";
    nativeCalls = new Map();
    handle(event) {
        switch (event.type) {
            case "agent.phase":
                // Display events must not drive model-call admission or budgets.
                break;
            case "assistant.response.started": {
                const turn = Number(event.turn);
                this.announcements.newResponse();
                this.emit({ type: "response_start", responseId: String(event.responseId), turn });
                break;
            }
            case "assistant.delta": {
                // A withheld response's notice is for Swarm's recovery boundary, not the user or the transcript.
                const delta = withoutWithheldNotice(String(event.delta));
                if (!delta)
                    break;
                this.transcript.delta(delta);
                this.emit({
                    type: "message_update",
                    assistantMessageEvent: { type: "text_delta", delta, responseId: String(event.responseId) },
                });
                break;
            }
            case "assistant.thinking.delta":
                this.emit({
                    type: "message_update",
                    assistantMessageEvent: { type: "thinking_delta", delta: String(event.delta), responseId: String(event.responseId) },
                });
                break;
            case "tool.started": {
                // Not translated (the bridge reports the tool from where it runs), but the model's call
                // is recorded and announced so the bridge can run under the model's id, in order.
                const trace = event.trace;
                const input = trace.input ?? JSON.stringify(trace.args ?? {});
                // Compact JSON like the model sent it; JiuwenSwarm re-serialises arguments with spaces.
                this.transcript.toolCall(trace.id, trace.name, JSON.stringify(trace.args ?? {}));
                if (trace.native === true || this.nativeTools.has(trace.name)) {
                    // Runs inside JiuwenSwarm: nothing will claim it at the bridge, so report it from here.
                    this.lastNativeCall = trace.id;
                    this.nativeCalls.set(trace.id, { args: trace.args ?? {}, name: trace.name });
                    this.emit({ type: "tool_execution_start", toolCallId: trace.id, toolName: trace.name, args: (trace.args ?? {}) });
                }
                else {
                    this.announcements.announce({ args: trace.args ?? {}, id: trace.id, input, name: trace.name });
                }
                break;
            }
            case "tool.completed": {
                const trace = event.trace;
                if (!this.nativeCalls.has(trace.id)) {
                    if (trace.status !== "failed")
                        break;
                    const call = this.announcements.failUnclaimed(trace.id);
                    if (!call)
                        break; // Already claimed/reported at the bridge, or duplicate.
                    const text = trace.output ?? "Tool failed before reaching the execution bridge";
                    this.emit({ type: "tool_execution_start", toolCallId: trace.id, toolName: call.name,
                        args: (call.args ?? {}) });
                    this.emit({ type: "tool_execution_end", toolCallId: trace.id, toolName: call.name, isError: true,
                        result: { content: [{ type: "text", text }] } });
                    this.transcript.toolResult(trace.id, call.name, text);
                    break;
                }
                const text = trace.output ?? "";
                this.emit({
                    type: "tool_execution_end", toolCallId: trace.id, toolName: trace.name, isError: trace.status === "failed",
                    result: { content: [{ type: "text", text }] },
                });
                this.transcript.toolResult(trace.id, trace.name, text);
                this.onNativeResult?.({ args: this.nativeCalls.get(trace.id)?.args, id: trace.id, name: trace.name, output: text, failed: trace.status === "failed" });
                this.nativeCalls.delete(trace.id);
                break;
            }
            case "plan.updated":
                this.onPlan?.(event.items, this.lastNativeCall);
                break;
            case "assistant.response.settled":
                this.transcript.settled();
                this.emit({ type: "response_settled", responseId: String(event.responseId), turn: Number(event.turn) });
                break;
            case "model.usage":
                // Account at the model gateway instead: Swarm fills missing reasoning with zero
                // and these events repeat calls already recorded there, including native children.
                break;
            default:
                break;
        }
    }
}
/** Each platform agent (main or task child) owns its provider-reported usage. */
class UsageReporter {
    emit;
    total;
    constructor(emit) {
        this.emit = emit;
    }
    record(reported) {
        if (!reported) {
            this.emit({ type: "model_usage", usageReported: false });
            return;
        }
        const usage = { ...reported, reasoningTokens: reported.reasoningTokens ?? null };
        this.emit({ type: "model_usage", usage, usageReported: true });
        this.add(usage);
    }
    /** Sum of the model calls of the run; null stays null unless some call reported a number. */
    add(usage) {
        const plus = (a, b) => (b === null || b === undefined ? a : (a ?? 0) + b);
        const total = this.total ?? { cacheReadTokens: null, cacheWriteTokens: null, inputTokens: 0, outputTokens: 0, reasoningTokens: null, totalTokens: 0 };
        // Key order matters: subagent summaries serialise this object into a tool result string.
        this.total = {
            inputTokens: total.inputTokens + usage.inputTokens,
            outputTokens: total.outputTokens + usage.outputTokens,
            reasoningTokens: plus(total.reasoningTokens, usage.reasoningTokens),
            totalTokens: total.totalTokens + usage.totalTokens,
            cacheReadTokens: plus(total.cacheReadTokens, usage.cacheReadTokens),
            cacheWriteTokens: plus(total.cacheWriteTokens, usage.cacheWriteTokens),
        };
    }
    /** The `usage` event the native agent emits once, after the last model call. */
    finish() {
        if (this.total)
            this.emit({ type: "usage", usage: this.total });
    }
}
async function* ndjson(body) {
    const decoder = new TextDecoder();
    let pending = "";
    for await (const chunk of body) {
        pending += decoder.decode(chunk, { stream: true });
        let newline = pending.indexOf("\n");
        while (newline >= 0) {
            const line = pending.slice(0, newline).trim();
            pending = pending.slice(newline + 1);
            if (line)
                yield JSON.parse(line);
            newline = pending.indexOf("\n");
        }
    }
    const rest = (pending + decoder.decode()).trim();
    if (rest)
        yield JSON.parse(rest);
}
async function readJson(request) {
    const chunks = [];
    for await (const chunk of request)
        chunks.push(chunk);
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
/**
 * The JiuwenSwarm session that holds one agent's conversation. It is stable across runs, so JiuwenSwarm
 * keeps (and compresses) the context itself, and there is one per agent: the main agent uses the
 * session's own id, a subagent its own key, so a resumed subagent finds its conversation. Nothing of the
 * conversation is sent along: JiuwenSwarm is the only holder of the model's context.
 */
export function jiuwenSwarmSessionKey(options) {
    const agentId = options.versioning?.agentId ?? "main";
    if (agentId.startsWith("main"))
        return options.sessionId;
    return `${options.sessionId}--${agentId.replace(/[^A-Za-z0-9_-]+/g, "-")}`;
}
/**
 * The native loop hides deferred tools (large MCP tool schemas) until the model finds them with
 * `tool_search`. JiuwenSwarm fixes the tool list when the run starts, so nothing can be revealed
 * later: promote every deferred tool now, offer them all, and keep `tool_search` in the list so a
 * model that asks for it (the system prompt tells it to) gets the schemas and the tools stay callable.
 */
async function offerDeferredTools(registry, tools, signal) {
    const deferred = [...registry.deferredNames()];
    if (!deferred.length)
        return;
    await registry.execute({ id: randomUUID(), name: TOOL_SEARCH_NAME, args: { query: `select:${deferred.join(",")}` } }, signal);
    tools.set(TOOL_SEARCH_NAME, { ...TOOL_SEARCH_SPEC, label: "Tool search" });
}
/** Loopback endpoint the adapter calls to run one of this run's tools. */
async function startBridge(registry, tools, token, signal, emit, announcements, transcript, announcementTimeoutMs) {
    const scheduler = new ToolScheduler(registry, announcements, announcementTimeoutMs);
    const server = createServer(async (request, response) => {
        const reply = (status, body) => {
            response.writeHead(status, { "content-type": "application/json" });
            response.end(JSON.stringify(body));
        };
        if (request.method !== "POST" || request.headers.authorization !== `Bearer ${token}`) {
            reply(401, { error: "unauthorized" });
            return;
        }
        let body;
        try {
            body = await readJson(request);
        }
        catch {
            reply(400, { error: "invalid JSON" });
            return;
        }
        const tool = body.name ? tools.get(body.name) : undefined;
        if (!tool) {
            reply(404, { error: `unknown tool: ${body.name}` });
            return;
        }
        // Watch before waiting for announcements: the caller can disconnect while
        // queued, not only after tool execution has started.
        const disconnected = new AbortController();
        response.once("close", () => {
            if (!response.writableEnded)
                disconnected.abort(new Error("MCP caller disconnected"));
        });
        const callSignal = AbortSignal.any([signal, disconnected.signal]);
        // Run under the model's own id and arguments, and only after the adapter has reported the call
        // (see ToolAnnouncements).
        const claimed = await announcements.claim(tool.name, body.arguments ?? {}, announcementTimeoutMs);
        if (callSignal.aborted) {
            if (!response.destroyed)
                reply(499, { error: "MCP caller disconnected before execution" });
            return;
        }
        if (!claimed)
            console.warn(`[jiuwenswarm-bridge] no model call was reported for ${tool.name}; running it under a generated id`);
        const toolCallId = claimed?.id ?? randomUUID();
        const args = claimed?.args ?? body.arguments ?? {};
        // A timed-out MCP client closes this HTTP response. Stop the corresponding
        // tool (notably a child agent) instead of leaving it running after the
        // parent has already received a transport failure.
        // registry.execute never throws for a failing tool: it answers with the standard error shape.
        // The scheduler holds the call back until the calls it may not overlap with have finished, so
        // the start is reported when the tool really starts, as the native loop does.
        let dispatched;
        try {
            dispatched = await scheduler.run({ id: toolCallId, name: tool.name, args }, callSignal, () => emit({ type: "tool_execution_start", toolCallId, toolName: tool.name, args }));
        }
        catch (error) {
            // Tool handlers are normalized by the registry, but result persistence
            // can still fail after the action has executed. Never let an async HTTP
            // handler rejection terminate the API, or invite a blind replay.
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[jiuwenswarm-bridge] dispatch of ${tool.name} failed: ${error instanceof Error ? error.stack : message}`);
            const details = { ok: false, error: { code: "TOOL_DISPATCH_FAILED", message,
                    retryable: false, outcome: "unknown", instruction: "The action may have executed. Inspect its state before attempting it again." } };
            const text = JSON.stringify(details);
            emit({ type: "tool_execution_end", toolCallId, toolName: tool.name, isError: true,
                result: { content: [{ type: "text", text }], details } });
            transcript.toolResult(toolCallId, tool.name, text);
            reply(200, { text, isError: true });
            return;
        }
        const isError = dispatched.isError === true;
        // Tool failures reach the model as text; without this line they are invisible to the operator.
        if (isError)
            console.warn(`[jiuwenswarm-bridge] tool ${tool.name} failed: ${dispatched.content.slice(0, 300)}`);
        if (process.env.SCIENCE_AGENT_JIUWENSWARM_DEBUG === "1") {
            console.warn(`[jiuwenswarm-bridge] ${tool.name}(${JSON.stringify(args).slice(0, 160)}) -> ${isError ? "ERROR " : ""}${dispatched.content.slice(0, 300)}`);
        }
        try {
            emit({
                type: "tool_execution_end", toolCallId, toolName: tool.name, isError,
                result: { content: [{ type: "text", text: dispatched.content }], ...(dispatched.details !== undefined ? { details: dispatched.details } : {}) },
            });
            transcript.toolResult(toolCallId, tool.name, dispatched.content);
        }
        catch (error) {
            // The model must still get its result: a failure reporting the call must not leave JiuwenSwarm waiting on it.
            console.error(`[jiuwenswarm-bridge] reporting the end of ${tool.name} failed: ${error instanceof Error ? error.stack : String(error)}`);
        }
        reply(200, { text: dispatched.content, isError });
        if (process.env.SCIENCE_AGENT_JIUWENSWARM_DEBUG === "1")
            console.warn(`[jiuwenswarm-bridge] answered ${tool.name} (${toolCallId})`);
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    return {
        url: `http://127.0.0.1:${port}/bridge`,
        close: () => new Promise((resolve) => {
            server.close(() => resolve());
            server.closeAllConnections();
        }),
    };
}
