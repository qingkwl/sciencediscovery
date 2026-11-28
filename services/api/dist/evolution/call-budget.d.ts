/**
 * What one mutation call is allowed to spend, in one place.
 *
 * Two callers have to agree: the proposal path writes the ceiling, and
 * pre-flight refuses a ceiling below the floor. They disagreed once — the
 * proposal path wrote 96k for every algorithm while pre-flight demanded 128k
 * for OpenEvolve, so asking for thinking on an OpenEvolve run was refused by
 * the default the path had just written itself. Sharing the table is what
 * makes "what a run gets" and "what a run needs" the same number.
 */
import type { EvolveAlgorithm, EvolveBudgetPlan, ModelProfile, ModelThinkingEffort, ModelThinkingMode } from "@sciencediscovery/schema";
/**
 * Floor for one mutation call, which depends on the *thinking* setting far more
 * than on the algorithm.
 *
 * Measured, not guessed, on GLM5.2 rewriting a small program:
 *
 * * thinking on, 16k ceiling: 16001 output tokens, **no content at all**, six
 *   expansions in a row — every one recorded as a candidate that would not run.
 * * thinking on, 64k ceiling: 11k–64k per call, and **two of eight still hit
 *   the cap**. So 64k is not comfortable either.
 * * thinking off: ~1.2k per call.
 *
 * Hence the two columns. With thinking on the budget must hold the reasoning
 * *and* the program, and the observed spread says six figures; with it off, a
 * few thousand is plenty and demanding more would refuse runs that work.
 */
export declare const MIN_TOKENS_PER_CALL: Record<string, {
    thinking: number;
    quiet: number;
}>;
/**
 * The ceiling a proposal gets when it does not name one.
 *
 * Deliberately the same for both algorithms: this is a working ceiling, not the
 * floor, and the floor only has to be at most this. The one exception is a
 * reasoning model, where the ceiling has to clear the algorithm's thinking
 * floor or every call is cut off before its first content token.
 */
export declare const QUIET_TOKENS_PER_CALL = 16000;
/** The run's own caps. A per-call ceiling caps one call; these cap the search. */
export declare const DEFAULT_MAX_TOKENS = 600000;
export declare const DEFAULT_MAX_SECONDS = 7200;
/** The per-call ceiling `create_evolve_run` will apply, from the setting the
 *  run will actually record. */
export declare function perCallCeiling(algorithm: EvolveAlgorithm, thinking: ModelThinkingMode): number;
export declare function describeEvolveBudget(model: ModelProfile | undefined, requestedThinking?: ModelThinkingMode, thinkingEffort?: ModelThinkingEffort): EvolveBudgetPlan;
