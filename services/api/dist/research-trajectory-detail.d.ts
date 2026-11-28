import type { TrajectoryDetail, TrajectoryIndex } from "@sciencediscovery/trajectory";
/**
 * Read one trajectory entry's detail, turning an unreadable record into an
 * omission instead of failing the whole preview or export (#1083).
 *
 * The trajectory reader throws `ENOENT` when an index entry points at a record
 * that was pruned, not yet published, or is being written by a live run. An
 * uncaught throw there surfaced as a bare 404 for
 * `level=complete&includeFullTrajectory=1` while the same session's other
 * combinations answered normally, and a reader that simply had no entry raised
 * a plain `Error`, i.e. a 500. Both are the same defect from the client's side:
 * one record it cannot show takes down a request that names nothing.
 *
 * This records the entry the way the package builder already records an
 * unreadable artifact version, CAS object or workspace file, and returns
 * `undefined` so the caller skips that entry. The resulting `details` stay
 * sparse, which both `trimTrajectory` and the importer tolerate: they look
 * details up by entry id rather than by position.
 */
export declare function readTrajectoryDetail(view: {
    detail(id: string): Promise<TrajectoryDetail | undefined>;
}, entry: {
    id: string;
}, sessionId: string, omit: (message: string) => void, signal?: AbortSignal): Promise<TrajectoryDetail | undefined>;
/**
 * Drop the entries whose detail could not be read.
 *
 * The importer is the reason this exists: `validatePackageTrajectory` rejects a
 * package whose `details.length` differs from `entries.length`, so skipping a
 * detail while leaving its index entry produced a package that exported fine
 * and then failed to import as `Invalid research package trajectory` (#1083).
 * Filtering all three index lists keeps the two sides 1:1.
 */
export declare function filterTrajectoryIndex(index: TrajectoryIndex, retained: ReadonlySet<string>): TrajectoryIndex;
