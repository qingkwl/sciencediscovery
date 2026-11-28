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
 * Runtime ownership of the model catalog snapshot.
 *
 * Two files hold the same envelope:
 *   - the packaging snapshot (`config.modelCatalogPath`), written into the
 *     image or release payload at build time and read-only at runtime, so a
 *     first start with no network still has a catalog;
 *   - this installation's own snapshot under the data directory, written by a
 *     manual refresh and preferred once it exists.
 *
 * A refresh only replaces the installed catalog after the download parsed,
 * mapped to at least one record, and reached disk. Anything short of that
 * leaves the previous snapshot in place and reports why.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fetchModelsDevCatalog, ModelCatalogFetchError } from "@sciencediscovery/model";
import { externalUrl, mapModelsDevCatalog, setModelCatalogSnapshot, } from "@sciencediscovery/schema";
import { apiLog } from "./logging.js";
export const MODEL_CATALOG_SNAPSHOT_FILE = "models-dev.json";
export function modelCatalogSourceUrl() {
    return externalUrl("model_catalog.api_json");
}
function isRecordObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseSnapshotFile(text) {
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch {
        return undefined;
    }
    if (!isRecordObject(parsed))
        return undefined;
    const { fetchedAt, payload, sourceUrl } = parsed;
    if (typeof fetchedAt !== "string" || !fetchedAt)
        return undefined;
    if (typeof sourceUrl !== "string" || !sourceUrl)
        return undefined;
    if (!isRecordObject(payload))
        return undefined;
    return { fetchedAt, payload: payload, sourceUrl };
}
export class ModelCatalogStore {
    #bundledPath;
    #cachePath;
    #fetchCatalog;
    #sourceUrl;
    #snapshot;
    constructor(options) {
        this.#bundledPath = options.bundledPath;
        this.#cachePath = join(options.dataDir, "model-catalog", MODEL_CATALOG_SNAPSHOT_FILE);
        this.#sourceUrl = options.sourceUrl ?? modelCatalogSourceUrl();
        this.#fetchCatalog = options.fetchCatalog ?? ((input) => fetchModelsDevCatalog(input));
    }
    get details() {
        return {
            ...(this.#snapshot ? { snapshot: this.#snapshot } : {}),
            sourceUrl: this.#sourceUrl,
        };
    }
    /** Install the best snapshot available on disk. A missing or unreadable file
     *  is not fatal: the product runs with an empty catalog, which every caller
     *  already treats as "this fact is unknown". */
    async load() {
        for (const [path, origin] of [
            [this.#cachePath, "downloaded"],
            [this.#bundledPath, "bundled"],
        ]) {
            const file = await this.#readSnapshotFile(path);
            if (!file)
                continue;
            const records = mapModelsDevCatalog(file.payload, {
                fetchedAt: file.fetchedAt,
                sourceUrl: file.sourceUrl,
            });
            if (!records.length) {
                apiLog.warn("model_catalog_snapshot_empty", { origin, path });
                continue;
            }
            this.#install({ fetchedAt: file.fetchedAt, origin, records, sourceUrl: file.sourceUrl });
            apiLog.info("model_catalog_loaded", { fetchedAt: file.fetchedAt, models: records.length, origin });
            return this.details;
        }
        apiLog.warn("model_catalog_unavailable", { source: this.#sourceUrl });
        return this.details;
    }
    /**
     * Download a fresh catalog and make it the installed snapshot. Throws
     * `ModelCatalogFetchError` without touching the installed snapshot when the
     * download, the mapping, or the write fails.
     */
    async refresh(proxy) {
        const payload = await this.#fetchCatalog({
            ...(proxy ? { proxy } : {}),
            url: this.#sourceUrl,
        });
        const fetchedAt = new Date().toISOString();
        const records = mapModelsDevCatalog(payload, { fetchedAt, sourceUrl: this.#sourceUrl });
        if (!records.length) {
            throw new ModelCatalogFetchError("The downloaded model catalog contains no models this product can use");
        }
        await this.#writeSnapshotFile({ fetchedAt, payload, sourceUrl: this.#sourceUrl });
        this.#install({ fetchedAt, origin: "downloaded", records, sourceUrl: this.#sourceUrl });
        apiLog.info("model_catalog_refreshed", { fetchedAt, models: records.length });
        return this.details;
    }
    #install(snapshot) {
        this.#snapshot = snapshot;
        setModelCatalogSnapshot(snapshot);
    }
    async #readSnapshotFile(path) {
        let text;
        try {
            text = await readFile(path, "utf8");
        }
        catch (error) {
            if (error.code !== "ENOENT") {
                apiLog.warn("model_catalog_snapshot_unreadable", { path });
            }
            return undefined;
        }
        const file = parseSnapshotFile(text);
        if (!file)
            apiLog.warn("model_catalog_snapshot_invalid", { path });
        return file;
    }
    async #writeSnapshotFile(file) {
        try {
            await mkdir(dirname(this.#cachePath), { recursive: true });
            // Write beside the target and rename so an interrupted refresh cannot
            // leave a half-written snapshot the next start would reject.
            const staging = `${this.#cachePath}.partial`;
            await writeFile(staging, JSON.stringify(file), "utf8");
            await rename(staging, this.#cachePath);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new ModelCatalogFetchError(`The downloaded model catalog could not be saved: ${message}`);
        }
    }
}
