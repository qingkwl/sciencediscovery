// Copyright (C) 2026-2026 Huawei Technologies Co., Ltd
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
import { isAnthropicEndpoint } from "@sciencediscovery/model";
export function createUsageBucket(key, label) {
    return {
        cacheReadTokens: null,
        cacheWriteTokens: null,
        costUsd: null,
        inputTokens: null,
        invocationCount: 0,
        key,
        label,
        outputTokens: null,
        reasoningTokens: null,
        reportedInvocationCount: 0,
        totalTokens: null,
        unreportedInvocationCount: 0,
    };
}
function addNullable(current, addition) {
    if (addition === null || addition === undefined)
        return current;
    return (current ?? 0) + addition;
}
export function addUsageToBucket(bucket, usage) {
    bucket.invocationCount += 1;
    if (usage.usageStatus === "reported") {
        bucket.reportedInvocationCount += 1;
        bucket.inputTokens = addNullable(bucket.inputTokens, usage.inputTokens);
        bucket.outputTokens = addNullable(bucket.outputTokens, usage.outputTokens);
        bucket.reasoningTokens = addNullable(bucket.reasoningTokens ?? null, usage.reasoningTokens);
        bucket.totalTokens = addNullable(bucket.totalTokens, usage.totalTokens);
        bucket.cacheReadTokens = addNullable(bucket.cacheReadTokens, usage.cacheReadTokens);
        bucket.cacheWriteTokens = addNullable(bucket.cacheWriteTokens, usage.cacheWriteTokens);
        bucket.costUsd = addNullable(bucket.costUsd, usage.costUsd);
    }
    else {
        bucket.unreportedInvocationCount += 1;
    }
}
function addToMap(buckets, key, label, usage) {
    let bucket = buckets.get(key);
    if (!bucket) {
        bucket = createUsageBucket(key, label);
        buckets.set(key, bucket);
    }
    addUsageToBucket(bucket, usage);
}
function sortBuckets(buckets) {
    return [...buckets].toSorted((left, right) => right.invocationCount - left.invocationCount
        || left.label.localeCompare(right.label)
        || left.key.localeCompare(right.key));
}
function normalizeInvocation(usage) {
    return {
        ...usage,
        cacheReadTokens: usage.cacheReadTokens ?? null,
        cacheWriteTokens: usage.cacheWriteTokens ?? null,
        reasoningTokens: usage.reasoningTokens ?? null,
        outcome: usage.outcome ?? "completed",
    };
}
export function summarizeModelUsage(sessionId, records) {
    const invocations = records
        .filter((usage) => usage.sessionId === sessionId)
        .map(normalizeInvocation)
        .toSorted((left, right) => left.startedAt.localeCompare(right.startedAt) || left.id.localeCompare(right.id));
    const totals = createUsageBucket(sessionId, "Session");
    const byModel = new Map();
    const byInvocationKind = new Map();
    const byRun = new Map();
    for (const usage of invocations) {
        addUsageToBucket(totals, usage);
        addToMap(byModel, usage.modelProfileId, usage.modelProfileName, usage);
        addToMap(byInvocationKind, usage.invocationKind, usage.invocationKind, usage);
        if (usage.runId)
            addToMap(byRun, usage.runId, usage.runId, usage);
    }
    return {
        byInvocationKind: sortBuckets(byInvocationKind.values()),
        byModel: sortBuckets(byModel.values()),
        byRun: sortBuckets(byRun.values()),
        invocations: structuredClone(invocations),
        ...(invocations.at(-1) ? { latestInvocation: structuredClone(invocations.at(-1)) } : {}),
        sessionId,
        totals,
    };
}
function resolveProjectId(usage, context) {
    return usage.projectId
        ?? context.projectIdBySessionId.get(usage.sessionId)
        ?? "unknown-project";
}
function buildRunGroups(records) {
    const groups = new Map();
    for (const usage of records) {
        const runId = usage.runId ?? null;
        const key = runId ?? `invocation:${usage.id}`;
        let group = groups.get(key);
        if (!group) {
            group = {
                bucket: createUsageBucket(key, runId ?? usage.invocationId),
                invocations: [],
                runId,
            };
            groups.set(key, group);
        }
        addUsageToBucket(group.bucket, usage);
        group.invocations.push(structuredClone(usage));
    }
    return [...groups.values()].toSorted((left, right) => right.bucket.invocationCount - left.bucket.invocationCount
        || (left.runId ?? "").localeCompare(right.runId ?? ""));
}
function buildSessionGroups(records, context) {
    const groups = new Map();
    for (const usage of records) {
        let group = groups.get(usage.sessionId);
        if (!group) {
            group = { records: [], sessionId: usage.sessionId };
            groups.set(usage.sessionId, group);
        }
        group.records.push(usage);
    }
    return [...groups.values()].map((group) => {
        const bucket = createUsageBucket(group.sessionId, context.sessionTitleById.get(group.sessionId) ?? group.sessionId);
        for (const usage of group.records)
            addUsageToBucket(bucket, usage);
        return {
            bucket,
            runs: buildRunGroups(group.records),
            sessionId: group.sessionId,
            sessionTitle: context.sessionTitleById.get(group.sessionId) ?? group.sessionId,
        };
    }).toSorted((left, right) => right.bucket.invocationCount - left.bucket.invocationCount
        || left.sessionTitle.localeCompare(right.sessionTitle));
}
function buildProjectGroups(records, context) {
    const groups = new Map();
    for (const usage of records) {
        const projectId = resolveProjectId(usage, context);
        let group = groups.get(projectId);
        if (!group) {
            group = { projectId, records: [] };
            groups.set(projectId, group);
        }
        group.records.push(usage);
    }
    return [...groups.values()].map((group) => {
        const projectName = context.projectNameById.get(group.projectId) ?? group.projectId;
        const bucket = createUsageBucket(group.projectId, projectName);
        for (const usage of group.records)
            addUsageToBucket(bucket, usage);
        return {
            bucket,
            projectId: group.projectId,
            projectName,
            sessions: buildSessionGroups(group.records, context),
        };
    }).toSorted((left, right) => right.bucket.invocationCount - left.bucket.invocationCount
        || left.projectName.localeCompare(right.projectName));
}
export function summarizeGlobalModelUsage(records, context) {
    const normalized = records.map(normalizeInvocation)
        .toSorted((left, right) => left.startedAt.localeCompare(right.startedAt) || left.id.localeCompare(right.id));
    const totals = createUsageBucket("global", "All models");
    const byModel = new Map();
    for (const usage of normalized) {
        addUsageToBucket(totals, usage);
        let group = byModel.get(usage.modelProfileId);
        if (!group) {
            group = {
                model: usage.model,
                modelProfileId: usage.modelProfileId,
                modelProfileName: usage.modelProfileName,
                records: [],
            };
            byModel.set(usage.modelProfileId, group);
        }
        group.records.push(usage);
    }
    const modelGroups = [...byModel.values()].map((group) => {
        const bucket = createUsageBucket(group.modelProfileId, group.modelProfileName);
        for (const usage of group.records)
            addUsageToBucket(bucket, usage);
        return {
            bucket,
            model: group.model,
            modelProfileId: group.modelProfileId,
            modelProfileName: group.modelProfileName,
            projects: buildProjectGroups(group.records, context),
        };
    }).toSorted((left, right) => right.bucket.invocationCount - left.bucket.invocationCount
        || left.modelProfileName.localeCompare(right.modelProfileName));
    return { byModel: modelGroups, totals };
}
const DEFAULT_USAGE_ANALYTICS_TIME_ZONE = "Asia/Shanghai";
function usageDateFormatter(timeZone) {
    return new Intl.DateTimeFormat("en-US", {
        day: "2-digit",
        month: "2-digit",
        timeZone,
        year: "numeric",
    });
}
function usageAnalyticsDateContext(requestedTimeZone) {
    const timeZone = requestedTimeZone?.trim() || DEFAULT_USAGE_ANALYTICS_TIME_ZONE;
    try {
        return { formatter: usageDateFormatter(timeZone), timeZone };
    }
    catch {
        return {
            formatter: usageDateFormatter(DEFAULT_USAGE_ANALYTICS_TIME_ZONE),
            timeZone: DEFAULT_USAGE_ANALYTICS_TIME_ZONE,
        };
    }
}
function dateBucket(usage, formatter) {
    const date = new Date(usage.startedAt);
    if (Number.isNaN(date.getTime()))
        return usage.startedAt.slice(0, 10);
    const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
}
function matchesFilters(usage, filters, context, formatter) {
    const date = dateBucket(usage, formatter);
    if (filters.from && date < filters.from)
        return false;
    if (filters.to && date > filters.to)
        return false;
    if (filters.modelProfileId && usage.modelProfileId !== filters.modelProfileId)
        return false;
    if (filters.projectId && resolveProjectId(usage, context) !== filters.projectId)
        return false;
    return true;
}
function addCost(costs, cost) {
    if (!cost)
        return;
    costs.set(cost.currency, (costs.get(cost.currency) ?? 0) + cost.amount);
}
function sortedCosts(costs) {
    return [...costs.entries()]
        .filter(([, amount]) => amount > 0)
        .map(([currency, amount]) => ({ amount, currency }))
        .toSorted((left, right) => left.currency.localeCompare(right.currency));
}
function findExchangeRate(exchangeRates, baseCurrency, quoteCurrency) {
    if (baseCurrency === quoteCurrency)
        return undefined;
    return exchangeRates?.find((rate) => rate.baseCurrency === baseCurrency
        && rate.quoteCurrency === quoteCurrency
        && Number.isFinite(rate.rate)
        && rate.rate > 0);
}
function convertUsageCostForDisplay(cost, displayCurrency, exchangeRates) {
    if (cost.currency === displayCurrency)
        return { cost };
    const exchangeRate = findExchangeRate(exchangeRates, cost.currency, displayCurrency);
    if (!exchangeRate)
        return undefined;
    return {
        cost: { amount: cost.amount * exchangeRate.rate, currency: displayCurrency },
        exchangeRate,
    };
}
function convertUsageCostsForDisplay(costs, displayCurrency, exchangeRates) {
    if (!displayCurrency || !costs.length)
        return undefined;
    let exchangeRate;
    let amount = 0;
    for (const cost of costs) {
        const converted = convertUsageCostForDisplay(cost, displayCurrency, exchangeRates);
        if (!converted)
            return undefined;
        amount += converted.cost.amount;
        exchangeRate ??= converted.exchangeRate;
    }
    return { cost: { amount: Number(amount.toFixed(12)), currency: displayCurrency }, ...(exchangeRate ? { exchangeRate } : {}) };
}
/** The dialect a profile's requests use, resolved as the model client resolves it. */
export function usageDialectOf(profile) {
    return profile.apiProtocol ?? (isAnthropicEndpoint(profile.baseUrl) ? "anthropic-messages" : "openai-chat-completions");
}
/** OpenAI-shaped dialects count the cache hits inside their prompt/input count. */
function promptContainsCacheRead(dialect) {
    return dialect === "openai-chat-completions" || dialect === "openai-responses";
}
export function estimateInvocationCost(usage, pricing, dialect) {
    if (usage.usageStatus !== "reported")
        return undefined;
    if (pricing) {
        const cacheReadTokens = usage.cacheReadTokens ?? 0;
        // When the prompt count already contains the cache hits, only the uncached
        // span may be charged at the input rate; the hits are charged at the cached
        // rate below instead of both.
        const inputTokens = promptContainsCacheRead(dialect)
            ? Math.max(0, (usage.inputTokens ?? 0) - cacheReadTokens)
            : usage.inputTokens ?? 0;
        // Chat Completions has no cache-write charge: its recorded write count is
        // prompt_cache_miss_tokens, the uncached prompt that is already charged as
        // input above. Anthropic Messages bills cache writes, so it keeps its own.
        const cacheWriteTokens = dialect === "openai-chat-completions" ? 0 : usage.cacheWriteTokens ?? 0;
        const amount = (inputTokens * pricing.input
            + (usage.outputTokens ?? 0) * pricing.output
            + cacheReadTokens * (pricing.cachedInput ?? pricing.input)
            + cacheWriteTokens * (pricing.cacheWriteInput ?? pricing.input)) / 1_000_000;
        return amount > 0 ? { amount, currency: pricing.currency } : undefined;
    }
    return usage.costUsd !== null && usage.costUsd !== undefined && usage.costUsd > 0
        ? { amount: usage.costUsd, currency: "USD" }
        : undefined;
}
function emptyReporting() {
    return { invocationCount: 0, reportedInputCount: 0, reportedOutputCount: 0, reportedTotalCount: 0 };
}
function addReporting(reporting, usage) {
    reporting.invocationCount += 1;
    if (usage.usageStatus !== "reported")
        return;
    if (typeof usage.inputTokens === "number")
        reporting.reportedInputCount += 1;
    if (typeof usage.outputTokens === "number")
        reporting.reportedOutputCount += 1;
    if (typeof usage.totalTokens === "number")
        reporting.reportedTotalCount += 1;
}
export function summarizeModelUsageAnalytics(records, context, filters = {}) {
    const { formatter, timeZone } = usageAnalyticsDateContext(filters.timeZone);
    const normalized = records
        .map(normalizeInvocation)
        .filter((usage) => matchesFilters(usage, filters, context, formatter))
        .toSorted((left, right) => left.startedAt.localeCompare(right.startedAt) || left.id.localeCompare(right.id));
    const overviewCosts = new Map();
    const daily = new Map();
    const overview = {
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        estimatedCosts: [],
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        reporting: emptyReporting(),
    };
    for (const usage of normalized) {
        const cost = estimateInvocationCost(usage, context.pricingByModelProfileId?.get(usage.modelProfileId), context.protocolByModelProfileId?.get(usage.modelProfileId));
        addCost(overviewCosts, cost);
        addReporting(overview.reporting, usage);
        if (usage.usageStatus === "reported") {
            overview.inputTokens += usage.inputTokens ?? 0;
            overview.outputTokens += usage.outputTokens ?? 0;
            overview.cacheReadTokens += usage.cacheReadTokens ?? 0;
            overview.cacheWriteTokens += usage.cacheWriteTokens ?? 0;
            overview.totalTokens += usage.totalTokens ?? 0;
        }
        const date = dateBucket(usage, formatter);
        const key = `${date}:${usage.modelProfileId}`;
        let row = daily.get(key);
        if (!row) {
            row = {
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
                costs: new Map(),
                date,
                estimatedCosts: [],
                inputTokens: 0,
                model: usage.model,
                modelProfileId: usage.modelProfileId,
                modelProfileName: usage.modelProfileName,
                outputTokens: 0,
                totalTokens: 0,
                reporting: emptyReporting(),
            };
            daily.set(key, row);
        }
        addCost(row.costs, cost);
        addReporting(row.reporting, usage);
        if (usage.usageStatus === "reported") {
            row.inputTokens += usage.inputTokens ?? 0;
            row.outputTokens += usage.outputTokens ?? 0;
            row.cacheReadTokens += usage.cacheReadTokens ?? 0;
            row.cacheWriteTokens += usage.cacheWriteTokens ?? 0;
            row.totalTokens += usage.totalTokens ?? 0;
        }
    }
    overview.estimatedCosts = sortedCosts(overviewCosts);
    const dailyByModel = [...daily.values()].map(({ costs, ...row }) => {
        const estimatedCosts = sortedCosts(costs);
        const [estimatedCost] = estimatedCosts;
        return {
            ...row,
            estimatedCosts,
            ...(estimatedCost ? { estimatedCost } : {}),
        };
    }).toSorted((left, right) => right.date.localeCompare(left.date)
        || left.modelProfileName.localeCompare(right.modelProfileName)
        || left.modelProfileId.localeCompare(right.modelProfileId));
    return {
        dailyByModel,
        filters: { ...filters, timeZone },
        generatedAt: new Date().toISOString(),
        overview,
    };
}
function csvCell(value) {
    const raw = value === null || value === undefined ? "" : String(value);
    const safe = /^[=+\-@]/.test(raw.trimStart()) ? `'${raw}` : raw;
    return `"${safe.replaceAll("\"", "\"\"")}"`;
}
export function modelUsageAnalyticsToCsv(summary, options = {}) {
    const lines = [
        [
            "date",
            "modelProfileName",
            "modelProfileId",
            "model",
            "inputTokens",
            "outputTokens",
            "cacheReadTokens",
            "cacheWriteTokens",
            "totalTokens",
            "estimatedCostOriginal",
            "originalCurrency",
            "displayCost",
            "displayCurrency",
            "displayExchangeRate",
            "displayExchangeRateSource",
            "displayExchangeRateRetrievedAt",
        ].map(csvCell).join(","),
    ];
    for (const row of summary.dailyByModel) {
        const displayCost = convertUsageCostsForDisplay(row.estimatedCosts, options.displayCurrency, summary.exchangeRates);
        lines.push([
            row.date,
            row.modelProfileName,
            row.modelProfileId,
            row.model,
            row.inputTokens,
            row.outputTokens,
            row.cacheReadTokens,
            row.cacheWriteTokens,
            row.totalTokens,
            row.estimatedCosts.map((cost) => cost.amount).join(" / "),
            row.estimatedCosts.map((cost) => cost.currency).join(" / "),
            displayCost?.cost.amount,
            displayCost?.cost.currency,
            displayCost?.exchangeRate ? `${displayCost.exchangeRate.baseCurrency}/${displayCost.exchangeRate.quoteCurrency} ${displayCost.exchangeRate.rate}` : undefined,
            displayCost?.exchangeRate?.provider,
            displayCost?.exchangeRate?.retrievedAt,
        ].map(csvCell).join(","));
    }
    return `${lines.join("\n")}\n`;
}
