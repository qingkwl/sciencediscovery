import { type SkillPackageBundle, type SkillPackageManifest } from "@sciencediscovery/schema";
import { type RuntimeSkillSnapshot } from "@sciencediscovery/specialist";
export declare const SKILL_SNAPSHOT_MANIFEST = ".sciencediscovery-snapshot.json";
/**
 * What this run selected, without its bytes. Each `hash` already covers that
 * package's files, so a Runner can be asked whether it holds this exact set
 * before anything is read off disk or put on the wire.
 */
export declare function readPreparedSkillManifest(root: string): Promise<SkillPackageManifest>;
/**
 * Transport only selected frozen bytes, never a control-plane mount path. Each
 * package is re-hashed from what is on disk before it leaves this machine, so a
 * snapshot damaged after staging fails the execution here rather than being
 * shipped to a Runner as if it were still the frozen package.
 */
export declare function readPreparedSkillBundle(root: string): Promise<SkillPackageBundle>;
export interface SkillSnapshotManifest {
    schemaVersion: 1;
    skills: Array<{
        hash: string;
        id: string;
        path: string;
        revision: number;
        version: string;
    }>;
}
/**
 * Identity of one selected Skill set, used as the content-addressed snapshot
 * directory name. Runs that select the same frozen revisions reuse one staged
 * tree, which also keeps a persistent kernel's mounts stable across runs.
 */
export declare function skillPackageSetHash(skills: readonly RuntimeSkillSnapshot[]): string;
/** Prepare one Agent execution's complete frozen Skill tree before its model loop starts. */
export declare function prepareSkillSandbox(root: string, workspaceRoot: string, skills: readonly RuntimeSkillSnapshot[]): Promise<{
    extensionRoot: string;
    manifest: SkillSnapshotManifest;
    root: string;
}>;
