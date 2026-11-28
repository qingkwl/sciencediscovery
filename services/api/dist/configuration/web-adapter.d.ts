import { type ConfigurationValues, type UpdateWebSettingsRequest, type WebBackend, type WebSettingsDetails } from "@sciencediscovery/schema";
import type { SessionStore } from "../store.js";
import type { ConfigurationAdapter } from "./types.js";
export declare function webConfigurationCurrent(settings: WebSettingsDetails, backend: WebBackend): ConfigurationValues;
/** Preserve Native search choices while saving a fetch source supported by the active backend. */
export declare function webConfigurationPatch(values: ConfigurationValues, current: WebSettingsDetails, backend: WebBackend): UpdateWebSettingsRequest;
export declare function createWebConfigurationAdapter(store: SessionStore, backend: () => WebBackend): ConfigurationAdapter;
export declare function webConfigurationFields(backend: WebBackend): {
    [k: string]: {
        kind: "string" | "boolean" | "ids" | "integer";
        maxLength?: number;
        minimum?: number;
        maximum?: number;
        choices?: readonly string[];
    };
};
