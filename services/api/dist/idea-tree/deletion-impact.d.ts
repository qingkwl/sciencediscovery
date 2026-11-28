import type { SkillDeletionReference } from "@sciencediscovery/schema";
import type { SessionStore } from "../store.js";
/** Durable Workflow references that must survive catalog edits and restarts. */
export declare function ideaTreeSkillDeletionReferences(store: SessionStore, skillId: string): Promise<SkillDeletionReference[]>;
