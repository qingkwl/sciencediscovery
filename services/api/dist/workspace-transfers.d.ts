import type { DatabaseSync } from "node:sqlite";
import { VersionStore, type AgentStateRef } from "@sciencediscovery/cas";
import type { RunnerClient } from "@sciencediscovery/executor";
import type { ExecutionOwner, WorkspaceTransfer, WorkspaceTransferInput } from "@sciencediscovery/schema";
export type TransferEndpoint = {
    id: string;
    root: string;
} | {
    id: string;
    workspaceKey: string;
    runner: RunnerClient;
};
export interface TransferAccess {
    /** Resolve every operation from trusted ownership and current permissions, never from a model path. */
    resolve(id: string): TransferEndpoint;
    /** Orchestrator-only captured local source; never accepted in model input. */
    sourceSnapshot?: AgentStateRef;
    committed?(file: WorkspaceTransfer["progress"][number], transfer: WorkspaceTransfer): Promise<void>;
}
/** Durable transfer records, with no implicit replay after restart. Byte progress
 * is distinct from publication: only a successful target receipt marks a file complete. */
export declare class WorkspaceTransfers {
    private readonly db;
    private readonly versions;
    private active;
    constructor(db: DatabaseSync, versions: VersionStore);
    private save;
    list(owner: ExecutionOwner): WorkspaceTransfer[];
    snapshot(sessionId: string, agentId?: string): WorkspaceTransfer[];
    get(id: string, owner: ExecutionOwner): WorkspaceTransfer;
    start(owner: ExecutionOwner, input: WorkspaceTransferInput, access: TransferAccess): WorkspaceTransfer;
    cancel(id: string, owner: ExecutionOwner): Promise<WorkspaceTransfer>;
    wait(id: string, owner: ExecutionOwner): Promise<WorkspaceTransfer>;
    private perform;
}
