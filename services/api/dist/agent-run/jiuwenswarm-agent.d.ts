import { type streamModelTurn } from "@sciencediscovery/model";
import { type NativeAgentHandle, type NativeAgentOptions } from "../native-agent/index.js";
/**
 * An agent whose loop runs on JiuwenSwarm, behind the adapter.
 *
 * It keeps everything the legacy run already owns: the tools are the ones the
 * native agent would have got, and they still execute here, in this process,
 * through a loopback bridge the adapter calls. So permission checks, the
 * runner, artifacts and their events behave exactly as before; only the model
 * loop and its context live elsewhere.
 */
export interface JiuwenSwarmAgentConfig {
    /** Base URL of the adapter, e.g. http://127.0.0.1:4310. */
    adapterUrl: string;
    /** Bearer token the adapter expects on /agent/*, when it has one. */
    adapterToken?: string;
    /** How long the bridge waits for the adapter to report a tool call before running it anyway. */
    toolAnnouncementTimeoutMs?: number;
    /** Replaceable for tests. */
    fetch?: typeof fetch;
    /** Replaceable for tests: the native model client the run's model requests are served by. */
    modelStreamer?: typeof streamModelTurn;
    /**
     * Who keeps the plan. `todo` (default): the model uses JiuwenSwarm's own todo tools and its todo list
     * becomes the run's plan. `update_plan`: the model calls ScienceDiscovery's own tool instead.
     */
    planning?: "todo" | "update_plan";
    /**
     * What becomes of JiuwenSwarm's own system prompt. `prepend` (default): it stays whole (identity, safety,
     * tool rules, memory, context compression, installed skills); ScienceDiscovery's product prompt goes before
     * it and the run contract after it. `replace`: ScienceDiscovery's takes its place.
     */
    prompt?: "prepend" | "replace";
    /**
     * Which tools the model gets. `jiuwenswarm` (default): JiuwenSwarm's own (web, sub-agents, todo, memory,
     * skills ...) except those that act on the host (`JIUWENSWARM_HOST_TOOLS`: their work goes to ScienceDiscovery's
     * sandboxed tools), plus all of ScienceDiscovery's; on any other name clash JiuwenSwarm's is used. `ours`:
     * ScienceDiscovery's only (and JiuwenSwarm's todo tools for planning).
     */
    tools?: "jiuwenswarm" | "ours";
    /**
     * Whose skill mechanism the model uses. `jiuwenswarm` (default, with the `prepend` prompt and JiuwenSwarm's
     * tools): the run's skills are installed in JiuwenSwarm, listed by its prompt and loaded with its `skill_tool`;
     * ScienceDiscovery's skill catalog is left out; `read_skill` and, when resources exist,
     * `read_skill_resource` remain as fallbacks. `ours`: ScienceDiscovery's catalog and tools.
     */
    skills?: "jiuwenswarm" | "ours";
    /**
     * Desktop managed catalog packages require explicit first enable (SCIENCE_AGENT_SKILL_SELECTION=desktop).
     * JiuwenSwarm owns the global switches; starting a run never changes them.
     */
    skillSelection?: "desktop";
    /**
     * How the model delegates. `jiuwenswarm` (explicit opt-in, with JiuwenSwarm's tools): the model spawns and
     * collects sub-agents with JiuwenSwarm's own `subagent_spawn`/`subagent_wait`; ScienceDiscovery's `task`
     * is not offered. Those sub-agents run inside JiuwenSwarm itself, with its own built-in tools only: no
     * ScienceDiscovery tool, sandbox, workspace handoff or provenance reaches them. `task` (default): ScienceDiscovery's
     * own tool, as before (a full nested run, with its tools, sandbox, handoff and provenance).
     */
    subagents?: "jiuwenswarm" | "task";
}
/**
 * What the model is told about JiuwenSwarm's todo tools. The rest of the system prompt says to use only the
 * registered workspace tools, which these are not, and the plan guidance ScienceDiscovery normally gives
 * (the `update_plan` description, the plan context added at every step) does not apply to them.
 */
export declare const TODO_PLANNING_SECTION: string;
/**
 * What the model is told about JiuwenSwarm's own sub-agent tools, in place of ScienceDiscovery's `task`.
 * Needed only when JiuwenSwarm's own system prompt (which documents them) is not sent.
 */
export declare const SUBAGENT_DELEGATION_SECTION: string;
/**
 * [windows-desktop] F6 (gap 1a, 0.B0 审查#5): what the model is told when the run
 * executes unsandboxed (Provider A). JiuwenSwarm's native subagent tools are
 * hidden, not just undocumented, so this section replaces the delegation
 * guidance and points at the sandbox plugin as the unlock.
 */
export declare const UNSANDBOXED_SUBAGENT_SECTION: string;
/** ScienceDiscovery's web tools and the JiuwenSwarm tools that take their place. */
export declare const JIUWENSWARM_WEB_TOOLS: Record<string, string>;
/**
 * The same JiuwenSwarm tools by name, under the ScienceDiscovery tool each one stands in for. They stand in only for
 * a tool the run has: a Session with Web access unchecked gets neither ours nor these.
 */
export declare const JIUWENSWARM_NATIVE_WEB_TOOLS: Record<string, readonly string[]>;
/**
 * JiuwenSwarm's own tools that act on the host: the model never gets them. Commands and file writes go through
 * ScienceDiscovery's `run_shell`, reads through its file tools, so they run in its sandbox and Runner, with its
 * provenance. The adapter turns away a call the model makes to one anyway.
 */
export declare const JIUWENSWARM_HOST_TOOLS: readonly ["bash", "read_file", "write_file", "edit_file", "glob", "list_files", "grep", "read_pdf"];
/** What the model is told instead: JiuwenSwarm's own prompt still names those tools. */
export declare const HOST_TOOLS_SECTION = "Commands, scripts and file writes run in the sandbox through run_shell; read workspace files with read_file and list_files. Use workspace-relative paths in run_shell (for example, report.md): the host working directory shown by JiuwenSwarm is not accessible at the same absolute path inside the sandbox. JiuwenSwarm's bash, write_file, edit_file, glob, grep and read_pdf are not available here. skill_index may show absolute host paths for Skills, but those paths are not workspace paths: never pass them to read_file or run_shell. Load an indexed Skill with skill_tool(skill_name=<name>, relative_file_path=\"SKILL.md\"), and use skill_tool for its referenced package files. If skill_tool fails, including a filesystem lock error, immediately load that Skill with read_skill(skillId=<ScienceDiscovery skill id>) instead; use read_skill_resource for its referenced package files. Do not try to recover a failed skill_tool call by reading its host path with run_shell.";
/**
 * ScienceDiscovery's tools JiuwenSwarm's permission engine asks the user about: those that needed approval before
 * (they execute, reach a host or a Runner, or download), and every custom MCP connector tool (`mcp__...`). The
 * others are allowed. JiuwenSwarm is given this per tool; what the user then chooses ("always") is kept there.
 */
export declare const JIUWENSWARM_ASK_TOOLS: ReadonlySet<string>;
export declare const approvalFor: (name: string) => "allow" | "ask";
/** JiuwenSwarm's own todo tools, left visible to the model unless planning is `update_plan`. */
export declare const JIUWENSWARM_TODO_TOOLS: readonly ["todo_create", "todo_modify", "todo_list", "todo_get"];
/**
 * JiuwenSwarm's own sub-agent tools, offered in place of `task` unless
 * subagents is `task`. Recent WorkSwarm releases also expose `task_tool`;
 * hiding that alias is essential because otherwise it shadows the workspace
 * `task` bridge and only accepts JiuwenSwarm's built-in agent types.
 */
export declare const JIUWENSWARM_SUBAGENT_TOOLS: readonly ["subagent_spawn", "subagent_wait", "task_tool"];
/** Selected by SCIENCE_AGENT_EXECUTOR=jiuwenswarm; direct API startup without that setting uses native. */
export declare function jiuwenSwarmConfigFromEnv(env?: NodeJS.ProcessEnv): JiuwenSwarmAgentConfig | undefined;
export declare function createJiuwenSwarmAgentFactory(config: JiuwenSwarmAgentConfig): (options: NativeAgentOptions) => NativeAgentHandle;
/**
 * The JiuwenSwarm session that holds one agent's conversation. It is stable across runs, so JiuwenSwarm
 * keeps (and compresses) the context itself, and there is one per agent: the main agent uses the
 * session's own id, a subagent its own key, so a resumed subagent finds its conversation. Nothing of the
 * conversation is sent along: JiuwenSwarm is the only holder of the model's context.
 */
export declare function jiuwenSwarmSessionKey(options: Pick<NativeAgentOptions, "sessionId" | "versioning">): string;
