/**
 * The API's heap budget, and the evidence that it was actually applied.
 *
 * A budget is only worth anything if the process can tell whether it got one:
 * the abort in #1011 arrived with no warning because nothing bounded old space
 * and nothing reported it. The launch paths pass
 * `--max-old-space-size` (see `services/api/package.json`,
 * `scripts/start-stack.{sh,mjs}` and `services/launcher/src/serve.ts`), each
 * reading `SCIENCE_AGENT_API_MAX_OLD_SPACE_MB` with the same default; the API
 * then reports the flag it really received, so a launcher that forgets the
 * budget is visible in the log instead of silently falling back to V8's
 * default.
 *
 * `--max-old-space-size` bounds the old generation only. V8's
 * `heap_size_limit` is larger by the young generation, which is why the two
 * numbers are logged separately rather than compared for equality.
 */
export declare const API_MAX_OLD_SPACE_ENV = "SCIENCE_AGENT_API_MAX_OLD_SPACE_MB";
export declare const DEFAULT_API_MAX_OLD_SPACE_MB = 3072;
export declare const MIN_API_MAX_OLD_SPACE_MB = 256;
export declare const MAX_API_MAX_OLD_SPACE_MB = 32768;
export interface HeapBudget {
    /** The old-space budget this process should have: the flag, else the environment, else the default. */
    budgetMb: number;
    /** The `--max-old-space-size` this process really received, if any. */
    explicitMb: number | undefined;
    /** The environment override, if it is set — launchers read it, the API only reports it. */
    envMb: number | undefined;
    /** V8's own limit in MiB: old space plus the young generation. */
    effectiveLimitMb: number;
}
/** The override from the environment, or `undefined` when a launcher should use the default. */
export declare function apiMaxOldSpaceMb(env?: NodeJS.ProcessEnv): number | undefined;
/** The `--max-old-space-size` a process was started with, from its arguments or `NODE_OPTIONS`. */
export declare function explicitOldSpaceMb(execArgv?: readonly string[], nodeOptions?: string): number | undefined;
export declare function heapBudget(options?: {
    env?: NodeJS.ProcessEnv;
    execArgv?: readonly string[];
    nodeOptions?: string;
    heapLimitBytes?: number;
}): HeapBudget;
/**
 * What is wrong with the budget this process actually runs under, or
 * `undefined` when it is applied and consistent with the environment.
 */
export declare function heapBudgetWarning(budget: HeapBudget): string | undefined;
