import type { GitSkillImportJob, StartGitSkillImportJobRequest } from "@sciencediscovery/schema";
import { type SkillCatalog } from "@sciencediscovery/specialist";
/**
 * Start one background Git import.
 *
 * The packages are installed by the API process, not by the request that asked
 * for them: the reader can leave the page (or close 设置) and the job keeps
 * going. One job at a time is enough for a single-user control plane, and it
 * keeps the retained checkout from being expanded by two batches at once.
 */
export declare function startGitSkillImportJob(catalog: SkillCatalog, request: StartGitSkillImportJobRequest, onChanged?: () => void): GitSkillImportJob;
export declare function getGitSkillImportJob(id: string): GitSkillImportJob | undefined;
export declare function cancelGitSkillImportJob(id: string): GitSkillImportJob | undefined;
