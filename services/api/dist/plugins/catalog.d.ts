import type { PluginManifest } from "@sciencediscovery/plugin-sdk";
/** Only installed trusted packages are advertised. No user-supplied entry imports. */
export declare const installedPlugins: readonly PluginManifest[];
export declare const hostServices: {
    id: string;
    version: number;
}[];
export declare const hostPermissions: string[];
