import { type VersionStore } from "@sciencediscovery/cas";
/** Export a selected file, not whichever bytes a concurrent Shell has written so
 * far. Explicit inline text remains an independent, immutable input. */
export declare function storeEvolutionInput(versions: VersionStore, workspace: string, input: {
    content?: string;
    path?: string;
}): Promise<string>;
