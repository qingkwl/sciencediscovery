import { getHeapStatistics } from "node:v8";
import { API_MAX_OLD_SPACE_ENV, DEFAULT_API_MAX_OLD_SPACE_MB, heapBudget, heapBudgetWarning } from "./heap-budget.js";
const scheduleWithInterval = (tick, intervalMs) => {
    const timer = setInterval(tick, intervalMs);
    // Never hold the process open for a log line.
    timer.unref?.();
    return { cancel: () => clearInterval(timer) };
};
function nodeMemorySample() {
    const usage = process.memoryUsage();
    return {
        rssBytes: usage.rss,
        heapUsedBytes: usage.heapUsed,
        heapTotalBytes: usage.heapTotal,
        externalBytes: usage.external,
        // The ceiling the launch path set, as V8 reports it (old space plus the
        // young generation). `heapTotal` is only the committed heap and would make
        // the ratio meaningless.
        heapLimitBytes: getHeapStatistics().heap_size_limit,
    };
}
const mib = (bytes) => Math.round((bytes / (1024 * 1024)) * 10) / 10;
export function createMemoryWatch(options) {
    const { log } = options;
    const sample = options.sample ?? nodeMemorySample;
    const budget = options.budget ?? heapBudget();
    const intervalMs = options.intervalMs ?? 30_000;
    const warnRatio = options.warnRatio ?? 0.75;
    const criticalRatio = options.criticalRatio ?? 0.9;
    const limitBytes = options.heapLimitBytes;
    const scheduler = options.scheduler ?? scheduleWithInterval;
    let warned = false, critical = false;
    const read = () => {
        const value = sample();
        return limitBytes === undefined ? value : { ...value, heapLimitBytes: limitBytes };
    };
    const sampleOnce = () => {
        const value = read();
        const limit = Math.max(value.heapLimitBytes, 1);
        const heapRatio = Math.round((value.heapUsedBytes / limit) * 1000) / 1000;
        const fields = {
            rssMiB: mib(value.rssBytes),
            heapUsedMiB: mib(value.heapUsedBytes),
            heapTotalMiB: mib(value.heapTotalBytes),
            externalMiB: mib(value.externalBytes),
            heapRatio,
            budgetMb: budget.budgetMb,
        };
        log.info("api_memory_sample", fields);
        if (heapRatio >= criticalRatio && !critical) {
            critical = true;
            log.warn("api_memory_critical", {
                ...fields,
                guidance: `The heap is at ${Math.round(heapRatio * 100)}% of the budget; V8 aborts at --max-old-space-size=${budget.budgetMb}. Finish or export the running session, or raise ${API_MAX_OLD_SPACE_ENV}.`,
            });
        }
        else if (heapRatio >= warnRatio && !warned) {
            warned = true;
            log.warn("api_memory_pressure", {
                ...fields,
                guidance: `The heap is at ${Math.round(heapRatio * 100)}% of the ${budget.budgetMb} MiB budget (default ${DEFAULT_API_MAX_OLD_SPACE_MB}).`,
            });
        }
        return { heapRatio, rssMiB: fields.rssMiB, heapUsedMiB: fields.heapUsedMiB };
    };
    const start = () => {
        const warning = heapBudgetWarning(budget);
        log.info("api_heap_budget", {
            budgetMb: budget.budgetMb,
            explicitMb: budget.explicitMb ?? "unset",
            envMb: budget.envMb ?? "unset",
            effectiveLimitMiB: budget.effectiveLimitMb,
            ...(warning ? { guidance: warning } : {}),
        });
        if (warning)
            log.warn("api_heap_budget_implicit", { budgetMb: budget.budgetMb, guidance: warning });
        sampleOnce();
        const timer = scheduler(sampleOnce, intervalMs);
        return () => timer.cancel();
    };
    return { sampleOnce, start };
}
