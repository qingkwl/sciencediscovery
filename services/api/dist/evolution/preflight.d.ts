/**
 * What has to be true before a search is allowed to start.
 *
 * The engine will not stop any of this for you. It warns on an empty reply and
 * moves on — and an empty reply becomes a failed node, which is
 * **indistinguishable from a candidate that genuinely would not run**. So every
 * check here exists because its failure mode is silent, expensive, or both: a
 * run that cannot possibly accept anything still costs a full budget of model
 * calls before anyone notices.
 *
 * Refusals happen at creation, not at the first expansion. A user who has
 * watched a progress bar for a minute has already paid for the mistake.
 */
import type { EvolveGoal, ModelProfile } from "@sciencediscovery/schema";
import { hasBlockingIssue } from "./scorecard.js";
import type { EvolveSandboxCapability } from "./sandbox.js";
export interface PreflightIssue {
    code: string;
    /** What the user should change. A refusal without one is a dead end. */
    fix: string;
    message: string;
}
/** Whether a scorecard executes candidates rather than only reading text. */
export declare function executesCandidates(goal: EvolveGoal): boolean;
/** The isolation refusals for a goal against the backend this process probed.
 *
 *  Split out because a retry reuses a goal that already passed pre-flight:
 *  replaying every check would re-read the dataset and the model, but the one
 *  property that can change under a stored goal is whether the machine still
 *  has the isolation the goal relied on. */
export declare function isolationIssues(goal: EvolveGoal, sandbox: EvolveSandboxCapability): PreflightIssue[];
export interface PreflightInput {
    /** Whether a content hash is in the store. Absent skips the dataset checks —
     *  a caller with no content store cannot answer, and guessing "missing" would
     *  refuse every run. */
    casHas?: (hash: string) => Promise<boolean>;
    goal: EvolveGoal;
    model: ModelProfile | undefined;
    sandbox: EvolveSandboxCapability;
    /** Whether this endpoint can actually be told to stop thinking. A dialect
     *  with no thinking-control field accepts the setting and ignores it, so the
     *  quiet floor would under-budget every call while the run reports that
     *  thinking is off. Absent means the caller could not tell, and the goal's
     *  own setting stands. */
    thinkingSupported?: boolean;
}
export declare function preflight(input: PreflightInput): Promise<PreflightIssue[]>;
/** Whether the scorecard's own structural checks passed. Exposed so the wizard
 *  can show them before the run request is even built. */
export { hasBlockingIssue };
