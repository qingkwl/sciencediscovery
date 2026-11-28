import { type IdeaTreeAuthorityRegistry } from "@sciencediscovery/idea-tree";
import type { IdeaTreeExecutorDescriptor, SkillDescriptor } from "@sciencediscovery/schema";
import type { RuntimeSkillSnapshot, SkillCatalog } from "@sciencediscovery/specialist";
type ExecutorCapability = NonNullable<SkillDescriptor["ideaTreeExecutor"]>;
export interface ResolvedExecutorCapability {
    capability: ExecutorCapability;
    executor?: IdeaTreeExecutorDescriptor;
    workflowSkill?: RuntimeSkillSnapshot;
}
/**
 * Resolve the one canonical Idea Tree Executor capability used by catalog,
 * Session validation, and Run queueing. New v5 Runs use the current Markdown
 * workflow; workflowSkill is accepted only to restore legacy exact snapshots.
 * Availability also requires the server-owned Result Authority.
 */
export declare function resolveExecutorCapability(input: {
    ideaTreeAuthorities: IdeaTreeAuthorityRegistry;
    skillCatalog: SkillCatalog;
    skillId: string;
    workflowSkill?: IdeaTreeExecutorDescriptor["workflowSkill"];
}): Promise<ResolvedExecutorCapability>;
export {};
