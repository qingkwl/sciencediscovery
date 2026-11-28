import type { ContentStore } from "@sciencediscovery/cas";
import type { EvolveScorecard, EvolveSplit, ScorecardCriterion } from "@sciencediscovery/schema";
export declare class DatasetStagingError extends Error {
}
/** What staging needs of a content store: the bytes behind a hash. */
export type DatasetSource = Pick<ContentStore, "read">;
export type ShardRole = "gate" | "rollout" | "test";
export interface PlannedShard {
    index: number;
    role: ShardRole;
    /** Row indices into the *original* file, after the seeded shuffle. */
    rows: number[];
}
export interface SplitPlan {
    shards: PlannedShard[];
    trainRows: number[];
}
/**
 * Which rows train and which rows measure.
 *
 * Pure, so the property that matters — the same seed gives the same split, and
 * nothing measured was trained on — is testable without touching a disk.
 */
export declare function planSplit(rowCount: number, split: EvolveSplit): SplitPlan;
/**
 * What is wrong with a split independently of any dataset, or `undefined`.
 *
 * Separated from `planSplit` so the pre-flight checks can run it before a run
 * exists. Whether a *particular* dataset has enough rows genuinely needs the
 * dataset, and that check stays where the rows are.
 */
export declare function validateSplit(split: EvolveSplit): string | undefined;
export interface StagedDataset {
    /** Absolute path the sidecar is handed. */
    directory: string;
    /** What was staged, per criterion, for the run log. */
    staged: Array<{
        criterionId: string;
        rows: number;
        shards: number;
    }>;
}
export interface StageDatasetInput {
    /** Only `read` is needed. Declaring the narrow shape keeps a test from having
     *  to build a store it does not use. */
    cas: DatasetSource;
    directory: string;
    scorecard: EvolveScorecard;
}
/**
 * Materialise every dataset-backed criterion into `directory`.
 *
 * Layout, which `measurement.py` reads through the manifest and never by
 * convention:
 *
 * ```
 * manifest.json
 * <criterionId>/train.csv          the rows every shard's candidate trains on
 * <criterionId>/<shard>/test.csv   features only — no target column
 * <criterionId>/<shard>/truth.json the target values, kept out of reach
 * ```
 */
export declare function stageDataset(input: StageDatasetInput): Promise<StagedDataset>;
/** Whether a criterion is measured on a dataset at all. `seconds` is read off
 *  the run itself, which is what makes a "training time" veto expressible. */
export declare function needsData(criterion: ScorecardCriterion): boolean;
/** The schema writes `sha256:<hex>`; the store is keyed by the bare hex. */
export declare function casHash(ref: string): string;
export interface Table {
    header: string[];
    rows: string[][];
}
export declare function parseCsv(text: string): Table;
export declare function toCsv(header: string[], rows: string[][]): string;
/**
 * A seeded Fisher–Yates over `[0, count)`.
 *
 * `Math.random` would make two runs of the same goal measure on different rows,
 * so a search could not be compared with its own baseline, let alone with
 * another run.
 */
export declare function shuffled(count: number, seed: number): number[];
