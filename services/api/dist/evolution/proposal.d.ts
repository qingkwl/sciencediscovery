/**
 * Turning a proposal from the main agent into a run.
 *
 * The agent designs in the terms it has — text it just wrote, paths it just
 * read — and this is where those become the terms a run needs: content in the
 * store, a frozen scorecard, a hash. That translation is deliberately on this
 * side. An agent that could mint its own goal could also mint one whose scoring
 * it controls, and the whole design rests on the scoring being frozen *away*
 * from the thing being scored.
 *
 * **Every gate stays.** The discrimination probe runs here, not on trust: the
 * tool description tells the agent to check its own scoring with `run_python`
 * first, and that instruction is an efficiency measure, not a substitute. A
 * claim from the party being graded is not evidence. Pre-flight runs too, and
 * both refusals come back as text the agent can act on rather than as failures
 * — "your held-out set cannot tell good from bad" is a design note, and the
 * designer is right there in the loop.
 *
 * This replaced a separate drafting agent that had its own loop, its own
 * progress stream and its own copy of the workspace tools. What it could never
 * have was an interpreter: it wrote evaluators it could not run, so every
 * divide-by-zero and every too-easy sample set had to be discovered by the
 * probe and repaired in another round trip. The main loop has `run_python`.
 */
import type { EvolveRunStatus, EvolveRunSummary, EvolveRunProposal, EvolveRunProposalResult, ModelThinkingEffort, ModelThinkingMode } from "@sciencediscovery/schema";
import type { EvolveOrchestrator } from "./orchestrator.js";
/** What the assembler needs from the world. Injected so the unit tests need no
 *  store, no sandbox and no model. */
export interface ProposalDeps {
    /** Puts text or a workspace file into the store; returns its `sha256:` ref. */
    store: (input: {
        content?: string;
        path?: string;
    }) => Promise<string>;
    /** Reads a stored blob back as text, by the ref `store` returned. A file's
     *  contents — not its path — are what gets checked, so the check has to read
     *  the bytes that will run, after they are stored. */
    readText: (hash: string) => Promise<string>;
    casHas?: (hash: string) => Promise<boolean>;
    model?: (id: string) => unknown;
    modelId: string;
    orchestrator: EvolveOrchestrator;
    /** Whether the user's own `/evolve-design` command carried `--allow-direct`.
     *  Required on purpose: the proposal's `allowUnisolated` is the model's
     *  argument, and a goal records direct execution only when the model asked
     *  and the user's command approved. A caller that cannot answer must not
     *  inherit the approval. */
    approvedUnisolated: boolean;
    sessionId: string;
    /** Frozen parent Run settings; explicit proposal settings take precedence. */
    thinking?: ModelThinkingMode;
    thinkingEffort?: ModelThinkingEffort;
    /** Whether the run's model can be told to stop thinking. False when its API
     *  variant has no thinking-control field, or a toggle but no "disabled" stop:
     *  the request is accepted and ignored, and the quiet ceiling then pays for
     *  reasoning nobody sees. Required: a caller that cannot answer must not
     *  silently inherit the quiet ceiling. */
    thinkingSupported: boolean;
    /** Searches already running on this session, if the caller can answer.
     *
     *  One search owns the session's budget and its frozen scoring, so a second
     *  one started beside it is the failure #997 records: two live panels, two
     *  formulas, and no way for the user to say which result counts. Checked
     *  before anything is spent — the probe alone runs two real evaluations.
     *  Optional so a caller without the store still works; the composition root
     *  always supplies it. */
    activeRuns?: () => Promise<Array<{
        id: string;
        status: string;
    }>>;
}
/**
 * Assemble, probe, pre-flight, start.
 *
 * Returns a refusal rather than throwing for anything the agent can fix, and
 * throws only when the environment is broken — the distinction matters because
 * the first is a conversation and the second is an incident.
 */
export declare function startProposedRun(proposal: EvolveRunProposal, deps: ProposalDeps): Promise<EvolveRunProposalResult>;
/**
 * A finished search, reduced to what is worth saying out loud.
 *
 * Read from the event log rather than the run record: the record carries
 * counters, and what a person wants is the shape of the outcome — did it beat
 * the start, by how much, and on the split that never took part. The last of
 * those is the only number quotable outside the run.
 */
export declare function summariseRun(run: {
    candidates?: number;
    id: string;
    status: EvolveRunStatus;
    tokens?: number;
}, events: Array<{
    event: Record<string, unknown>;
}>): EvolveRunSummary;
