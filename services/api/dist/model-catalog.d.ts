import { type ModelCatalogDetails, type ModelsDevPayload, type ResolvedProxy } from "@sciencediscovery/schema";
export declare const MODEL_CATALOG_SNAPSHOT_FILE = "models-dev.json";
export declare function modelCatalogSourceUrl(): string;
export interface ModelCatalogStoreOptions {
    /** Snapshot written at packaging time; the offline fallback. */
    bundledPath: string;
    dataDir: string;
    /** Injected in tests so the load/refresh/degrade behaviour is exercised
     *  without reaching the network. */
    fetchCatalog?: (options: {
        proxy?: ResolvedProxy;
        url: string;
    }) => Promise<ModelsDevPayload>;
    sourceUrl?: string;
}
export declare class ModelCatalogStore {
    #private;
    constructor(options: ModelCatalogStoreOptions);
    get details(): ModelCatalogDetails;
    /** Install the best snapshot available on disk. A missing or unreadable file
     *  is not fatal: the product runs with an empty catalog, which every caller
     *  already treats as "this fact is unknown". */
    load(): Promise<ModelCatalogDetails>;
    /**
     * Download a fresh catalog and make it the installed snapshot. Throws
     * `ModelCatalogFetchError` without touching the installed snapshot when the
     * download, the mapping, or the write fails.
     */
    refresh(proxy?: ResolvedProxy): Promise<ModelCatalogDetails>;
}
