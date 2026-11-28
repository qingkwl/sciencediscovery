import type { ArtifactReviewRun } from "@sciencediscovery/schema";
import type { SessionStore } from "../store.js";
/**
 * One review answers for exactly one Artifact version. Once that Artifact has a
 * newer version, the stored verdict still belongs to the history and must not be
 * read as the current conclusion. The marker is computed on read and never
 * persisted, so a later version renders the same review as history without
 * rewriting what the Reviewer actually decided.
 */
export declare function annotateReviewStaleness(store: Pick<SessionStore, "listArtifactVersions">, sessionId: string, reviews: readonly ArtifactReviewRun[]): ArtifactReviewRun[];
