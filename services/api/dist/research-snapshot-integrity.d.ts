import { type ResearchPackageIds } from "./research-package-history.js";
/** Fail closed before publishing a writable copy. CAS hashes cover file/log bytes. */
export declare function verifyResearchCopy(sourceValue: unknown, targetValue: unknown, ids: ResearchPackageIds, sessions: Map<string, string>, projectId: string, 
/** Source evolve run id -> restored run id: a remapped run renames its result
 *  artifact (`evolve/<run>/<entrypoint>`), so the expected side is remapped the
 *  same way before comparing (#1176 review F3). */
evolveRunIds?: Map<string, string>): void;
