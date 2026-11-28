import type { Subagent } from "@sciencediscovery/schema";
import type { SessionStore } from "../store.js";
export declare function declaredDeliverablePath(requirement: string): string | undefined;
/** Structured delivery declarations a task made through its subagent Briefs. */
export declare function declaredDeliverablePaths(subagents: readonly Subagent[]): string[];
/**
 * Reviewer input for delivery completeness. `undefined` means neither the
 * reviewed run(s) nor the Session declared a structured deliverable, and the
 * review must say the scope was limited rather than present the citation check
 * as an overall pass.
 *
 * `source` distinguishes an authoritative run-scoped requirement (`brief`) from
 * a Session-wide fallback (`session-fallback`). The Reviewer only re-derives a
 * reused verdict for `brief`: a fallback set belongs to other runs, and letting
 * it decide would wash a real REVISE into an ACCEPT.
 */
export interface ReviewDeliverableRequirements {
    paths: string[];
    scope: "run" | "session";
    source: "brief" | "session-fallback";
}
export declare function sessionRequiredDeliverables(store: Pick<SessionStore, "listSubagents">, sessionId: string, parentRunIds?: readonly string[]): ReviewDeliverableRequirements | undefined;
/**
 * Everything a Reviewer audit task needs about the run(s) it reviews. Both real
 * paths (automatic Artifact registration and the manual re-review) hand the
 * runner a synthetic tool-call id, so this is the one place that turns it back
 * into a run context — a caller must not do that conversion itself.
 */
export interface AuditReviewContext {
    /** The newest reviewed run, for APIs that take one; the synthetic id otherwise. */
    parentRunId: string;
    parentRunIds: string[];
    /**
     * The union of every reviewed run's declarations, for callers that take one set.
     * A checkpoint must not use it as a fallback for a single report: see
     * `requiredDeliverablesFor`.
     */
    requiredDeliverables?: ReviewDeliverableRequirements;
    /**
     * Requirements of the run behind one reviewed version. `undefined` means neither
     * that run nor (through the Session fallback) the Session declared anything, and
     * the report must be reported as unconfirmed — never as another run's set.
     */
    requiredDeliverablesFor: (version: {
        turnId?: string;
    }) => ReviewDeliverableRequirements | undefined;
}
export interface ReviewCheckpointInput {
    /** Empty means "no explicit list": the checkpoint scans the parent run's reports. */
    artifactVersionIds: string[];
    parentRunId: string;
    requiredDeliverablesFor: (version: {
        turnId?: string;
    }) => ReviewDeliverableRequirements | undefined;
}
export declare function auditReviewContext(store: Pick<SessionStore, "getArtifactVersion" | "listSubagents">, task: {
    artifactVersionIds: readonly string[];
    sessionId: string;
    toolCallId: string;
}): AuditReviewContext;
/**
 * The Reviewer checkpoint fields both entry points hand to `runReviewerCheckpoint`,
 * assembled in one testable place.
 *
 * This is the seam where the delivery gate broke twice (a synthetic tool-call id
 * used as a run id, then a per-report resolver silently replaced by a batch-wide
 * set), so it is a function instead of two lines duplicated in two callers: a test
 * can call it, and a mutation that drops the per-version resolver shows up as a
 * failing assertion rather than as a caller-only regression.
 *
 * The batch-wide set is deliberately not included: with a per-version resolver
 * present it is dead weight, and without it, it is the bug.
 */
export declare function reviewCheckpointInput(store: Pick<SessionStore, "getArtifactVersion" | "listSubagents">, task: {
    artifactVersionIds?: readonly string[];
    sessionId: string;
    toolCallId: string;
}): ReviewCheckpointInput;
/**
 * The root run(s) behind the Artifacts a review covers. A Reviewer audit task
 * only carries a synthetic tool-call id (`automatic-review:<uuid>` /
 * `manual-review:<messageId>`), which is never a run id, so the run is read
 * from the reviewed Artifact versions instead.
 *
 * A version records the turn that wrote it. For a main-Agent file that is the
 * run itself; for a subagent's file it is the subagent's own id
 * (`childExecution.identity.executionId`), which never equals its
 * `parentTurnId`. Those turns are mapped back to the run that started the
 * subagent, so its Briefs are found and the gate does not quietly fall back to
 * the whole Session.
 *
 * One audit can cover versions produced by different runs: the coordinator
 * merges a newly registered version into the pending checkpoint. Every distinct
 * run is returned, newest first, so the check covers all of them — judging a
 * run-A report with only run-B's Brief would invent a missing deliverable or
 * drop a real one.
 */
export declare function reviewedRunIds(store: Pick<SessionStore, "getArtifactVersion" | "listSubagents">, sessionId: string, artifactVersionIds: readonly string[] | undefined): string[];
/**
 * Requirements of the run that produced one reviewed version. A subagent writes
 * its Artifacts with the subagent id as `turnId`, so that id is mapped back to the
 * run that started it before the Briefs are looked up.
 */
export declare function requirementsForVersion(store: Pick<SessionStore, "getArtifactVersion" | "listSubagents">, sessionId: string, version: {
    turnId?: string;
}): ReviewDeliverableRequirements | undefined;
