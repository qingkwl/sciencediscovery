import type { JiuwenSwarmSkill } from "@sciencediscovery/schema";
import type { JiuwenSwarmAgentConfig } from "./jiuwenswarm-agent.js";
/**
 * A run's skills, installed in JiuwenSwarm.
 *
 * With the JiuwenSwarm backend its own skill mechanism is used: its prompt lists the installed skills and the
 * model loads one with `skill_tool` (or reads its SKILL.md). The frozen packages the API staged for the run
 * are imported there through the adapter (`skills.import_local`); a skill whose name JiuwenSwarm already uses
 * is installed as `sciencediscovery-<id>`.
 *
 * Returns, by skill id, the name JiuwenSwarm lists it under. A skill missing from the answer was not
 * imported, and the run offers it the ScienceDiscovery way. Never throws.
 */
export declare function importSkillsToJiuwenSwarm(config: Pick<JiuwenSwarmAgentConfig, "adapterToken" | "adapterUrl" | "fetch">, skills: ReadonlyArray<{
    hash: string;
    id: string;
}>, packagesRoot: string, signal?: AbortSignal): Promise<Map<string, string>>;
/**
 * The skill a JiuwenSwarm tool call loaded, by ScienceDiscovery id: `skill_tool` on a skill's SKILL.md, or
 * `read_file` of `.../<name>/SKILL.md`. `ids` maps JiuwenSwarm's names to ours.
 */
export declare function skillLoadedBy(call: {
    args: unknown;
    name: string;
}, ids: ReadonlyMap<string, string>): string | undefined;
/** Every skill JiuwenSwarm has installed and whether it is on. */
export declare function listJiuwenSwarmSkills(config: Pick<JiuwenSwarmAgentConfig, "adapterToken" | "adapterUrl" | "fetch">, signal?: AbortSignal): Promise<JiuwenSwarmSkill[]>;
/** Switch one of JiuwenSwarm's skills on or off. It is one setting for every session; sessions started afterwards see it. */
export declare function setJiuwenSwarmSkillEnabled(config: Pick<JiuwenSwarmAgentConfig, "adapterToken" | "adapterUrl" | "fetch">, name: string, enabled: boolean, signal?: AbortSignal): Promise<void>;
/**
 * How many switches one bulk action sends at once.
 *
 * The adapter toggles one skill per management call, so a page of 31 skills is
 * 31 switches however the request is shaped. Sent one after another they took
 * seconds, which is what made the bulk buttons feel frozen. Bounded rather
 * than unbounded: they share one JiuwenSwarm, and a page can list hundreds of
 * skills.
 */
export declare const SKILL_SWITCH_CONCURRENCY = 6;
/** One switched skill and, when JiuwenSwarm refused it, why. */
export interface JiuwenSwarmSkillSwitchOutcome {
    error?: string;
    name: string;
}
/**
 * Switch several installed skills to one state at once, and report every
 * refusal instead of stopping at the first.
 *
 * A bulk action is a UI convenience over one setting: one skill JiuwenSwarm
 * refuses must not leave the rest unswitched. The caller reports the failures
 * per skill so the page can roll back exactly those rows; nothing here retries.
 */
export declare function setJiuwenSwarmSkillsEnabled(config: Pick<JiuwenSwarmAgentConfig, "adapterToken" | "adapterUrl" | "fetch">, names: readonly string[], enabled: boolean, signal?: AbortSignal): Promise<JiuwenSwarmSkillSwitchOutcome[]>;
/**
 * JiuwenSwarm's language, from the UI's: its own prompt, rails and tools, and the language it asks the model to
 * answer in. One setting for every session (sessions started afterwards use it).
 */
export declare function setJiuwenSwarmLanguage(config: Pick<JiuwenSwarmAgentConfig, "adapterToken" | "adapterUrl" | "fetch">, language: "en" | "zh"): Promise<void>;
