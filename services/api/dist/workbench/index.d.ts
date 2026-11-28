import { type ChatMessage, type ComposerReference, type WorkbenchSearchResponse } from "@sciencediscovery/schema";
import { SkillCatalog } from "@sciencediscovery/specialist";
import { SessionStore } from "../store.js";
export declare function searchWorkbench(store: SessionStore, query: string, options?: {
    limit?: number;
    offset?: number;
}): Promise<WorkbenchSearchResponse>;
export declare function resolveComposerReferences(references: ComposerReference[] | undefined, sessionId: string, store: SessionStore, skillCatalog: SkillCatalog): Promise<ComposerReference[]>;
export declare function messagePromptContent(message: Pick<ChatMessage, "annotations" | "content" | "references" | "runtimeNotice">): string;
