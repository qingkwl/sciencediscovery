import type { TrajectoryDetail, TrajectoryIndex } from "@sciencediscovery/trajectory";
import type { ResearchPackageIds } from "./research-package-history.js";
/** Self-contained read evidence, including legacy journals and resolved CAS payloads. */
export interface PackageTrajectory {
    index: TrajectoryIndex;
    details: TrajectoryDetail[];
    runIds: string[];
    /** Import-only authority derived from verified objects; never accepted from package JSON. */
    access?: {
        agentAliases: Record<string, string>;
        refs: string[];
    };
}
export declare function emptyPackageTrajectory(sessionId: string): PackageTrajectory;
/** Bind old event identities only to CAS closures physically present in the imported package. */
export declare function importedTrajectoryAccess(source: unknown, owner: (streamId: string) => string | undefined, objects: ReadonlyMap<string, Uint8Array>): NonNullable<PackageTrajectory["access"]>;
export declare function validatePackageTrajectory(source: PackageTrajectory, sessionId: string, runIds: Set<string>, agentIds: Set<string>): void;
export declare function readPackageTrajectory(dataDir: string, sessionId: string): Promise<PackageTrajectory | undefined>;
export declare function writePackageTrajectory(dataDir: string, sessionId: string, trajectory: PackageTrajectory): Promise<void>;
/** Relocate navigation identities only; model input, reasoning and raw evidence stay exact. */
export declare function remapPackageTrajectory(source: PackageTrajectory, sessionId: string, ids: ResearchPackageIds): PackageTrajectory;
