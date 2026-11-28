import { type EvolveEventRecord, type EvolveRun } from "@sciencediscovery/schema";
import { EvolutionStore } from "./store.js";
export interface PackageEvolveRun {
    events: EvolveEventRecord[];
    run: EvolveRun;
}
export interface EvolveRestoreResult {
    /** One line per run that could not be restored, in the receipt's own style. */
    omissions: string[];
    restored: number;
    runIds: Map<string, string>;
}
/** A package cannot ask the importer to create an unbounded number of runs. */
export declare const MAX_RUNS = 200;
export interface ExportEvolveRunsResult {
    /** The runs carried, oldest first. */
    runs: PackageEvolveRun[];
    /** Runs dropped because the package caps at {@link MAX_RUNS}. */
    truncated: number;
}
/** Every run of the given sessions, with its event log, oldest first so a
 *  reader can replay the search in the order it happened. */
export declare function exportEvolveRuns(store: EvolutionStore, sessionIds: readonly string[]): Promise<ExportEvolveRunsResult>;
/**
 * Recreate the package's runs under `target.sessionId`.
 *
 * An active run at export time is stored as `stopped`: nothing is executing on
 * the importing machine, and presenting it as `running` would show a search that
 * can never advance. Colliding ids are remapped so each session owns its copy.
 */
export declare function restoreEvolveRuns(store: EvolutionStore, target: {
    projectId?: string;
    sessionId: string;
}, payload: unknown): Promise<EvolveRestoreResult>;
