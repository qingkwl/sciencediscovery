/**
 * The scorecard: normalise each criterion, aggregate into one reward, and check
 * the constraints — plus the validation that must pass before a run may start.
 *
 * Everything here is a pure function of (scorecard, measurements, baseline).
 * The engine binding and the acceptance policy call it; nothing in this file
 * touches disk, the network or the clock, which is what lets the awkward parts
 * (a drifting reference, a card that cannot rank) be tested exhaustively.
 *
 * **Normalisation always produces "higher is better".** The search maximises one
 * scalar, so a criterion the user wants small has to be turned around here
 * rather than anywhere downstream. Which normalisation may pair with which
 * direction is therefore not a style question but a correctness one, and
 * `validateScorecard` refuses the mismatches.
 *
 * **The reference is the baseline, never the current best.** A reference that
 * moves with the search makes yesterday's 0.8 and today's 0.8 different numbers:
 * the acceptance prior is polluted and replaying the same candidates no longer
 * reproduces their scores.
 */
import type { EvolveScorecard, ScorecardCriterion } from "@sciencediscovery/schema";
/** Raw, un-normalised measurements keyed by criterion id. */
export type Measurements = Readonly<Record<string, number>>;
export interface ConstraintViolation {
    constraintId: string;
    criterionId: string;
    /** Human-readable, shown in the candidate row and stored on the node. */
    detail: string;
    limit: number;
    observed: number;
}
export interface CandidateScore {
    /** Per-criterion normalised values, keyed by criterion id. */
    criteria: Record<string, number>;
    /** The aggregate in `[0, 1]` — what the engine maximises. */
    reward: number;
    /** Empty when the candidate may merge. Non-empty refuses the merge; it does
     *  **not** change `reward`, because a violating candidate still has to rank. */
    violations: ConstraintViolation[];
}
export type ValidationSeverity = "error" | "warning";
export interface ValidationIssue {
    code: string;
    criterionId?: string;
    message: string;
    severity: ValidationSeverity;
}
/** Baseline and a deliberately-degraded variant, both measured. The degraded
 *  one exists for one reason: a card whose total cannot tell them apart cannot
 *  rank anything, and that failure is silent. */
export interface ValidationProbes {
    baseline: Measurements;
    degraded?: Measurements;
}
/**
 * Map one raw measurement into `[0, 1]`, higher-is-better.
 *
 * `baseline` is only read by `relative_to_baseline`; passing the wrong one there
 * is the drift bug this module exists to prevent, so it is a required argument
 * rather than an optional context field.
 */
export declare function normalize(criterion: ScorecardCriterion, raw: number, baseline: number): number;
/** Weights as fractions of their sum, so a card whose weights read 3/1/1 works
 *  the same as one that reads 0.6/0.2/0.2. */
export declare function normalizedWeights(scorecard: EvolveScorecard): Map<string, number>;
/**
 * Score one candidate.
 *
 * `violations` travel beside the reward rather than inside it: writing a refusal
 * as "score 0" would tie every violating candidate together, and the tree's
 * exploitation term is a *rank*, so a block of ties flattens exactly the signal
 * it reads. A violating candidate keeps its score, enters the tree, and can be
 * selected for expansion — it simply may not merge.
 */
export declare function scoreCandidate(scorecard: EvolveScorecard, measurements: Measurements, baseline: Measurements): CandidateScore;
/**
 * Combine the normalised criteria.
 *
 * `weighted_geomean` drags the total to 0 when any criterion is ~0 — the way to
 * say "no weak dimension is acceptable". `weighted_sum` lets one dimension pay
 * for another, which is what most cards want and why it is the default.
 */
export declare function aggregate(scorecard: EvolveScorecard, criteria: Readonly<Record<string, number>>, weights?: Map<string, number>): number;
/** Constraints read **raw** measurements, not normalised ones: "must finish
 *  within 300s" is a statement about seconds, and normalising first would make
 *  the threshold depend on the card's scaling choices. */
export declare function evaluateConstraints(scorecard: EvolveScorecard, measurements: Measurements, baseline: Measurements): ConstraintViolation[];
/**
 * Everything that must hold before a run may start.
 *
 * The two checks worth the effort are the last two. **A baseline that already
 * violates a constraint** means the search can never accept anything: it will
 * burn the whole budget and end with a dashboard full of `constraint-violated`.
 * **A card with no discrimination** — where the total cannot separate the
 * baseline from a deliberately worse variant — sends the search wandering across
 * flat ground, and unlike a wrong scale (which the engine's reward contract
 * catches on the first rollout) nothing downstream ever reports it.
 */
export declare function validateScorecard(scorecard: EvolveScorecard, probes?: ValidationProbes): ValidationIssue[];
export declare function hasBlockingIssue(issues: readonly ValidationIssue[]): boolean;
