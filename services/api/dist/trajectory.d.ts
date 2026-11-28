import { type TrajectoryDetail } from "@sciencediscovery/trajectory";
import type { SessionStore } from "./store.js";
/**
 * How many recorded Run events this view may hold while it is built.
 *
 * The builder below appends every event of every Run, of every agent stream and
 * every `tool-<id>` stream, and hands the whole array to `openSessionTrajectory`,
 * which keeps it for the life of the request (#1063, one layer above the
 * whole-stream reads #1061 fixed). A long research session therefore became one
 * unbounded array. It is bounded now: past the budget the oldest events are
 * dropped as newer ones arrive, and the trajectory index carries a warning
 * naming how many were left out, so the view is honest about being a tail
 * instead of pretending the session was shorter.
 *
 * What the index is built from — committed steps, event segments, journals and
 * contexts — is read from CAS, not from this array, so the newest work stays
 * complete and the warning is the only visible difference.
 */
export declare const TRAJECTORY_MAX_EVENTS_ENV = "SCIENCE_AGENT_TRAJECTORY_MAX_EVENTS";
export declare const DEFAULT_TRAJECTORY_MAX_EVENTS = 120000;
export declare const MIN_TRAJECTORY_MAX_EVENTS = 1000;
export declare const MAX_TRAJECTORY_MAX_EVENTS = 5000000;
export declare function trajectoryMaxEvents(env?: NodeJS.ProcessEnv): number;
/** The authenticated API host resolves ownership. The component never imports SessionStore. */
export declare function sessionTrajectory(store: SessionStore, sessionId: string, signal: AbortSignal, options?: {
    maxEvents?: number;
}): Promise<{
    index: import("@sciencediscovery/trajectory").TrajectoryIndex;
    detail: (id: string) => Promise<TrajectoryDetail | undefined>;
    exportRecords: () => AsyncGenerator<string, void, unknown>;
    eventCounts: Map<string, number>;
    archivedRunIds: Set<string>;
    visitedStreams: Map<string, Set<string>>;
}>;
