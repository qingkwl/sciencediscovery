import { type ModelProfile, type ModelThinkingMode, type ModelThinkingEffort } from "@sciencediscovery/schema";
import type { SessionStore } from "../store.js";
import type { ConfigurationAdapter } from "./types.js";
export declare function thinkingChoices(model: ModelProfile | undefined): {
    modes: ModelThinkingMode[];
    efforts: ModelThinkingEffort[];
};
/** P1 reuses formal runtime/reviewer settings; no active run or model is hot-swapped. */
export declare function createP1ConfigurationAdapters(store: SessionStore, nativeExecutor?: () => boolean): ConfigurationAdapter[];
