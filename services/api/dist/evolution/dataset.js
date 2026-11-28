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
/**
 * Turning a scorecard's dataset reference into shards a candidate can be run on.
 *
 * The split is decided **here** and read there. The sidecar consumes a manifest
 * and never re-derives which rows are a gate shard — asking the same question
 * twice in two languages is how two answers start to disagree, the same reason
 * the sandbox backend is probed once and handed down.
 *
 * Three properties this has to have, and one it must not.
 *
 * **The same goal stages the same split.** The shuffle is a seeded PRNG, not
 * `Math.random`, so a re-run of the same goal measures on the same rows. Without
 * that, two runs of the same search are not comparable and neither is a run
 * against its own baseline.
 *
 * **Train rows and measured rows are disjoint by construction.** They are carved
 * from one shuffled index list and never overlap. A candidate measured on rows
 * it trained on scores its own memory.
 *
 * **The candidate never sees the answer.** The target column is dropped from
 * every test file and kept as truth beside it. A candidate that can read the
 * answer key optimises for reading it, and that candidate scores perfectly.
 *
 * What it must not do is guess. Too few rows for the requested shards, a target
 * column that is not in the file, a value that is not a number — each is a
 * refusal with the numbers in it, because the alternative is a staged dataset
 * that is quietly smaller or quietly different from what the scorecard asked
 * for, and every score computed on it afterwards looks fine.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
/** Above this a staged dataset is refused rather than read into memory. The
 *  shards are small; the source is not, and reading it whole is the simple
 *  implementation this bound makes honest. */
const MAX_SOURCE_BYTES = 64 * 1024 * 1024;
export class DatasetStagingError extends Error {
}
/**
 * Which rows train and which rows measure.
 *
 * Pure, so the property that matters — the same seed gives the same split, and
 * nothing measured was trained on — is testable without touching a disk.
 */
export function planSplit(rowCount, split) {
    const impossible = validateSplit(split);
    if (impossible)
        throw new DatasetStagingError(impossible);
    const shardCount = split.rolloutShards + split.gateShards + split.testShards;
    const measured = shardCount * split.shardRows;
    const trainWanted = split.trainRows ?? rowCount - measured;
    if (trainWanted < 1 || trainWanted + measured > rowCount) {
        throw new DatasetStagingError(`the dataset has only ${rowCount} rows, which does not hold ${shardCount} shards x `
            + `${split.shardRows} rows (${measured} in total) plus ${Math.max(trainWanted, 1)} training rows`);
    }
    const order = shuffled(rowCount, split.seed);
    const trainRows = order.slice(0, trainWanted);
    const rest = order.slice(trainWanted);
    // Roles are assigned over the *shuffled* order, so a gate shard is never
    // simply the tail of the file — a dataset sorted by its target would
    // otherwise hand the gate a slice with no variance in it.
    const roles = [
        ...Array(split.rolloutShards).fill("rollout"),
        ...Array(split.gateShards).fill("gate"),
        ...Array(split.testShards).fill("test"),
    ];
    const shards = roles.map((role, index) => ({
        index,
        role,
        rows: rest.slice(index * split.shardRows, (index + 1) * split.shardRows),
    }));
    return { shards, trainRows };
}
/**
 * What is wrong with a split independently of any dataset, or `undefined`.
 *
 * Separated from `planSplit` so the pre-flight checks can run it before a run
 * exists. Whether a *particular* dataset has enough rows genuinely needs the
 * dataset, and that check stays where the rows are.
 */
export function validateSplit(split) {
    if (split.rolloutShards + split.gateShards + split.testShards < 1) {
        return "the scorecard asks for no shards at all";
    }
    if (split.shardRows < 1)
        return "each shard needs at least 1 row";
    if (split.trainRows !== null && split.trainRows < 1)
        return "the training row count must be at least 1";
    return undefined;
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
export async function stageDataset(input) {
    const criteria = (input.scorecard.criteria ?? []).filter(needsData);
    const manifest = {
        criteria: {}, schemaVersion: 1,
    };
    const staged = [];
    for (const criterion of criteria) {
        const measure = criterion.measure;
        const table = parseCsv(await readSource(input.cas, measure.datasetCas, criterion));
        if (table.rows.length === 0) {
            throw new DatasetStagingError(`the dataset for criterion "${criterion.name}" is empty`);
        }
        const targetColumn = table.header.indexOf(measure.target);
        if (targetColumn < 0) {
            throw new DatasetStagingError(`criterion "${criterion.name}" predicts the column ${JSON.stringify(measure.target)}, `
                + `which is not in the dataset; its columns are ${table.header.join(", ")}`);
        }
        const plan = planSplit(table.rows.length, measure.split);
        const base = resolve(input.directory, criterion.id);
        await mkdir(base, { recursive: true });
        await writeFile(resolve(base, "train.csv"), toCsv(table.header, plan.trainRows.map((row) => table.rows[row])), "utf-8");
        const features = table.header.filter((_, index) => index !== targetColumn);
        const shards = [];
        for (const shard of plan.shards) {
            const folder = resolve(base, String(shard.index));
            await mkdir(folder, { recursive: true });
            const rows = shard.rows.map((row) => table.rows[row]);
            await writeFile(resolve(folder, "test.csv"), toCsv(features, rows.map((row) => row.filter((_, index) => index !== targetColumn))), "utf-8");
            await writeFile(resolve(folder, "truth.json"), JSON.stringify(rows.map((row) => numeric(row[targetColumn], criterion, measure.target))), "utf-8");
            shards.push({
                index: shard.index,
                role: shard.role,
                test: `${criterion.id}/${shard.index}/test.csv`,
                train: `${criterion.id}/train.csv`,
                truth: `${criterion.id}/${shard.index}/truth.json`,
            });
        }
        manifest.criteria[criterion.id] = { shards };
        staged.push({ criterionId: criterion.id, rows: table.rows.length, shards: shards.length });
    }
    await mkdir(input.directory, { recursive: true });
    await writeFile(resolve(input.directory, "manifest.json"), JSON.stringify(manifest), "utf-8");
    return { directory: input.directory, staged };
}
/** Whether a criterion is measured on a dataset at all. `seconds` is read off
 *  the run itself, which is what makes a "training time" veto expressible. */
export function needsData(criterion) {
    return criterion.measure.kind === "dataset_metric"
        && criterion.measure.metric.name !== "seconds";
}
async function readSource(cas, refs, criterion) {
    if (refs.length === 0) {
        throw new DatasetStagingError(`criterion "${criterion.name}" names no dataset`);
    }
    const parts = [];
    let total = 0;
    for (const ref of refs) {
        let bytes;
        try {
            bytes = await cas.read(casHash(ref));
        }
        catch {
            // Named rather than swallowed: a dataset that is not in the store is a
            // different problem from one that will not parse.
            throw new DatasetStagingError(`the dataset ${ref} for criterion "${criterion.name}" is not in the content store`);
        }
        total += bytes.length;
        if (total > MAX_SOURCE_BYTES) {
            throw new DatasetStagingError(`the dataset for criterion "${criterion.name}" is over `
                + `${MAX_SOURCE_BYTES / 1024 / 1024}MB, which is not supported yet`);
        }
        parts.push(bytes);
    }
    return Buffer.concat(parts).toString("utf-8");
}
/** The schema writes `sha256:<hex>`; the store is keyed by the bare hex. */
export function casHash(ref) {
    return ref.startsWith("sha256:") ? ref.slice("sha256:".length) : ref;
}
function numeric(raw, criterion, column) {
    const value = Number(raw);
    if (raw === undefined || raw.trim() === "" || !Number.isFinite(value)) {
        // A NaN in the truth would poison every metric computed against it and
        // still come back looking like a number.
        throw new DatasetStagingError(`the target column ${column} for criterion "${criterion.name}" holds a value that is `
            + `not a number: ${JSON.stringify(raw ?? null)}`);
    }
    return value;
}
export function parseCsv(text) {
    const records = [];
    let field = "";
    let record = [];
    let quoted = false;
    let index = 0;
    const endField = () => { record.push(field); field = ""; };
    const endRecord = () => {
        endField();
        // A trailing newline must not become a row of one empty field.
        if (record.length > 1 || record[0] !== "")
            records.push(record);
        record = [];
    };
    while (index < text.length) {
        const char = text[index];
        if (quoted) {
            if (char === '"') {
                if (text[index + 1] === '"') {
                    field += '"';
                    index += 2;
                    continue;
                }
                quoted = false;
                index += 1;
                continue;
            }
            field += char;
            index += 1;
            continue;
        }
        if (char === '"' && field === "") {
            quoted = true;
            index += 1;
            continue;
        }
        if (char === ",") {
            endField();
            index += 1;
            continue;
        }
        if (char === "\r") {
            index += 1;
            continue;
        }
        if (char === "\n") {
            endRecord();
            index += 1;
            continue;
        }
        field += char;
        index += 1;
    }
    if (field !== "" || record.length > 0)
        endRecord();
    const header = records.shift() ?? [];
    return { header, rows: records };
}
export function toCsv(header, rows) {
    return [header, ...rows].map((row) => row.map(quote).join(",")).join("\n") + "\n";
}
function quote(value) {
    return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}
// --- Deterministic shuffle ---------------------------------------------------
/**
 * A seeded Fisher–Yates over `[0, count)`.
 *
 * `Math.random` would make two runs of the same goal measure on different rows,
 * so a search could not be compared with its own baseline, let alone with
 * another run.
 */
export function shuffled(count, seed) {
    const random = mulberry32(seed >>> 0);
    const order = Array.from({ length: count }, (_, index) => index);
    for (let index = count - 1; index > 0; index -= 1) {
        const swap = Math.floor(random() * (index + 1));
        [order[index], order[swap]] = [order[swap], order[index]];
    }
    return order;
}
function mulberry32(seed) {
    let state = seed;
    return () => {
        state = (state + 0x6D2B79F5) | 0;
        let value = Math.imul(state ^ (state >>> 15), 1 | state);
        value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}
