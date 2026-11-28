import type { AgentHistoryMessage } from "@sciencediscovery/orchestration";
/**
 * The restored conversation folded into a bounded, role-labelled block that the
 * first continuation turn can carry as system context.
 *
 * JiuwenSwarm keeps and compresses its own context per session, so an imported
 * or research-copy session — which allocates a brand-new executor session —
 * would otherwise start with no model-visible history. This text is the
 * equivalent model-context assembly: role ordering is preserved, tool calls
 * and their results are named so a call/result pair stays recognisable, and
 * the whole block is bounded so a large transcript cannot crowd out the turn.
 */
export declare function seedHistoryText(history: readonly AgentHistoryMessage[]): string;
