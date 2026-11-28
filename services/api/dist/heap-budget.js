// Copyright (C) 2026-2026 Huawei Technologies Co., Ltd
// Licensed under the Apache License, Version 2.0 (the "License");
import { getHeapStatistics } from "node:v8";
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
export const API_MAX_OLD_SPACE_ENV = "SCIENCE_AGENT_API_MAX_OLD_SPACE_MB";
export const DEFAULT_API_MAX_OLD_SPACE_MB = 3072;
export const MIN_API_MAX_OLD_SPACE_MB = 256;
export const MAX_API_MAX_OLD_SPACE_MB = 32768;
/** The override from the environment, or `undefined` when a launcher should use the default. */
export function apiMaxOldSpaceMb(env = process.env) {
    const raw = env[API_MAX_OLD_SPACE_ENV]?.trim();
    if (!raw)
        return undefined;
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < MIN_API_MAX_OLD_SPACE_MB || value > MAX_API_MAX_OLD_SPACE_MB) {
        throw new Error(`${API_MAX_OLD_SPACE_ENV} must be an integer between ${MIN_API_MAX_OLD_SPACE_MB} and ${MAX_API_MAX_OLD_SPACE_MB}, received "${raw}"`);
    }
    return value;
}
/** The `--max-old-space-size` a process was started with, from its arguments or `NODE_OPTIONS`. */
export function explicitOldSpaceMb(execArgv = process.execArgv, nodeOptions = process.env.NODE_OPTIONS ?? "") {
    const fromArguments = execArgv.find((argument) => argument.startsWith("--max-old-space-size="));
    const fromOptions = nodeOptions.split(/\s+/).find((argument) => argument.startsWith("--max-old-space-size="));
    const flag = fromArguments ?? fromOptions;
    if (!flag)
        return undefined;
    const value = Number(flag.slice("--max-old-space-size=".length));
    return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}
export function heapBudget(options = {}) {
    const envMb = apiMaxOldSpaceMb(options.env ?? process.env);
    const explicitMb = explicitOldSpaceMb(options.execArgv ?? process.execArgv, options.nodeOptions ?? options.env?.NODE_OPTIONS ?? process.env.NODE_OPTIONS ?? "");
    const limitBytes = options.heapLimitBytes ?? getHeapStatistics().heap_size_limit;
    return {
        budgetMb: explicitMb ?? envMb ?? DEFAULT_API_MAX_OLD_SPACE_MB,
        explicitMb,
        envMb,
        effectiveLimitMb: Math.round(limitBytes / (1024 * 1024)),
    };
}
/**
 * What is wrong with the budget this process actually runs under, or
 * `undefined` when it is applied and consistent with the environment.
 */
export function heapBudgetWarning(budget) {
    if (budget.explicitMb === undefined) {
        return `No --max-old-space-size reached this process; V8's default limit applies (${budget.effectiveLimitMb} MiB). Set ${API_MAX_OLD_SPACE_ENV} and launch through a path that passes the flag.`;
    }
    if (budget.envMb !== undefined && budget.envMb !== budget.explicitMb) {
        return `${API_MAX_OLD_SPACE_ENV}=${budget.envMb} was ignored: the process was started with --max-old-space-size=${budget.explicitMb}.`;
    }
    return undefined;
}
