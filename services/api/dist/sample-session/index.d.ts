import type { ArtifactOrigin, ArtifactOriginMeta, ScientificArtifactKind } from "@sciencediscovery/schema";
import type { SessionStore } from "../store.js";
/**
 * What a first install opens on.
 *
 * A new user lands on an empty sidebar: nothing to read, nothing to try, and
 * no way to tell whether a run is worth waiting for. This seeds one real
 * Session — the conversation, its run and that run's streams, the workspace
 * the analysis wrote, and the artifacts it published — so the transcript, the
 * tool blocks, the panel and the 产物 tab all have something in them before the
 * user has typed anything.
 *
 * The seed happens once, on an install that has no conversations of its own.
 * Its marker file is what makes that "once": deleting the sample is a decision
 * the user made, and a later start must not undo it.
 */
export declare const SAMPLE_SESSION_MARKER = ".sample-session-seeded";
/** One published version of one artifact, as the catalog records it. */
interface SampleArtifact {
    /** The version's bytes. An artifact's content lives in the content store,
     *  not in the workspace, so it travels with the payload rather than under
     *  `files`. */
    contentBase64: string;
    description: string;
    /** The runs the version came from, limited to the runs this payload ships. */
    executionRunIds: string[];
    kind: ScientificArtifactKind;
    logicalName: string;
    mediaType: string;
    origin: ArtifactOrigin;
    originMeta?: ArtifactOriginMeta;
    /** The Artifact id the recorded transcript cites, when one of its messages
     *  carries a chip for this document. Seeding mints new ids, so the reference
     *  is rewritten to the new one — a citation has to open the seeded document,
     *  not a row that does not exist on this install. */
    recordedArtifactId?: string;
    sourcePath: string;
    title: string;
    turnId: string;
    /** 1 for a first version. A later one is written on top of the version
     *  before it in this list, which is what makes it the same artifact. */
    version: number;
}
interface SampleSession {
    /** The workspace's text files, by the path the store reads them from. */
    files: Record<string, string>;
    /** The ones that are not text — a figure, an image — as base64. Kept apart
     *  so a text file is written back byte for byte through utf8 and an image is
     *  not mangled through it. */
    encoded: Record<string, string>;
    /** The artifacts the analysis published, oldest version first. */
    artifacts: SampleArtifact[];
    projectName: string;
    sessionTitle: string;
}
/** The payload as it was packed; exported for the seeds and for tests. */
export declare function sampleSession(): SampleSession;
/**
 * The payload with this install's own ids in place of the placeholders.
 *
 * The Session and Project are created by the store like any other, so they get
 * new ids; every reference to the originals inside the streams is rewritten
 * here. The data directory is rewritten too, because the run streams record
 * the absolute paths the run worked in.
 */
export declare function fillSampleSession(text: string, ids: {
    dataDir: string;
    projectId: string;
    sessionId: string;
}): string;
/**
 * Seed the sample Session, if this install should have one.
 *
 * Returns whether anything was written. Never throws: a sample that cannot be
 * written is a missing convenience, not a reason to refuse to start.
 */
export declare function seedSampleSession(store: SessionStore): Promise<boolean>;
export {};
