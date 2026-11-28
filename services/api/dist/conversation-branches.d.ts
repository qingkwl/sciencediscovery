import { type ExportInput, type ResearchPackageCounts } from "@sciencediscovery/research-package";
import type { MemoryGraphSnapshot } from "@sciencediscovery/memory";
import type { ExportArtifact, ExportSessionRecord } from "./research-snapshots.js";
/** Select evidence by recorded ownership AND time. Current bytes are never an old revision. */
export declare function buildConversationBranch(input: ExportInput, sourceId: string, messageId: string, readCas: (hash: string) => Promise<Uint8Array>, count: (sessions: ExportSessionRecord[], artifacts: ExportArtifact[], graph?: MemoryGraphSnapshot) => ResearchPackageCounts): Promise<ExportInput>;
