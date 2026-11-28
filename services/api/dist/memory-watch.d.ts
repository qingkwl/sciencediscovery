import type { LogFields } from "@sciencediscovery/operational-logging";
import { type HeapBudget } from "./heap-budget.js";
/**
 * The signal the abort in #1011 did not have.
 *
 * The process died at V8's default old-space limit after 2,641,988 ms of
 * uptime with nothing in the log beforehand, so nobody could tell a long
 * research session was close to the edge. This watch samples
 * `process.memoryUsage()` on an interval, states once which budget it is
 * running under, and warns as the heap approaches that budget — before V8
 * aborts the process.
 *
 * Old space is what `--max-old-space-size` bounds, so the ratios use
 * `heapUsed / heapTotal` growth against V8's own limit rather than RSS: RSS
 * also carries the CAS buffers and typed arrays that the limit does not cover,
 * and comparing it to the old-space budget would warn too early.
 */
export interface MemorySample {
    rssBytes: number;
    heapUsedBytes: number;
    heapTotalBytes: number;
    externalBytes: number;
    heapLimitBytes: number;
}
export interface MemoryWatchLog {
    info(event: string, fields?: LogFields): void;
    warn(event: string, fields?: LogFields): void;
}
export interface MemoryWatch {
    /** Log one sample now, and the thresholds it crossed. */
    sampleOnce(): {
        heapRatio: number;
        rssMiB: number;
        heapUsedMiB: number;
    };
    /** State the budget, then sample every interval. Returns the stop function. */
    start(): () => void;
}
/** The repeating timer, injectable so a test can assert the sampling stopped. */
export interface RepeatingTimer {
    cancel(): void;
}
export type MemoryWatchScheduler = (tick: () => void, intervalMs: number) => RepeatingTimer;
export declare function createMemoryWatch(options: {
    log: MemoryWatchLog;
    intervalMs?: number;
    sample?: () => MemorySample;
    budget?: HeapBudget;
    heapLimitBytes?: number;
    warnRatio?: number;
    criticalRatio?: number;
    scheduler?: MemoryWatchScheduler;
}): MemoryWatch;
