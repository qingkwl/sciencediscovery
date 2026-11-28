import { type BackendControl, type BackendWriteOperation, type BackendWriteReceipt } from "./backend-control.js";
import type { DatabaseSync } from "node:sqlite";
export interface ExternalOperationRecord {
    operation: BackendWriteOperation;
    state: "prepared" | "sending" | "external_unknown" | "applied" | "rejected" | "suppressed";
    receipt?: BackendWriteReceipt;
    errorCode?: string;
}
/** Each callback is durable; claim serializes workers and mutations at the host's cancellation boundary. */
export interface ExternalOperationJournal {
    claim(operationId: string): Promise<ExternalOperationRecord | undefined>;
    save(record: ExternalOperationRecord): Promise<void>;
    release(operationId: string): Promise<void>;
    isAuthorized(operation: BackendWriteOperation): Promise<boolean>;
    recordApplied(record: ExternalOperationRecord & {
        receipt: BackendWriteReceipt;
    }): Promise<void>;
}
/** CFG-T24: after a crash/timeout in sending, only query. An unknown outcome never becomes a new write. */
export declare class ConfigurationOperationWorker {
    private readonly backend;
    private readonly journal;
    constructor(backend: BackendControl, journal: ExternalOperationJournal);
    process(operationId: string): Promise<ExternalOperationRecord | undefined>;
}
/** Durable single-host journal. Leases survive API crashes; sending resumes as query-only. */
export declare class SqliteExternalOperationJournal implements ExternalOperationJournal {
    private readonly options;
    private readonly leases;
    constructor(options: {
        database: DatabaseSync;
        isAuthorized(operation: BackendWriteOperation): Promise<boolean>;
        /** Synchronous host domain commit on this same database/transaction. */
        commitApplied(record: ExternalOperationRecord & {
            receipt: BackendWriteReceipt;
        }): void;
        now?: () => number;
        leaseMs?: number;
    });
    prepare(operation: BackendWriteOperation): void;
    read(operationId: string): ExternalOperationRecord | undefined;
    claim(operationId: string): Promise<ExternalOperationRecord | undefined>;
    save(record: ExternalOperationRecord): Promise<void>;
    release(operationId: string): Promise<void>;
    isAuthorized(operation: BackendWriteOperation): Promise<boolean>;
    private assertImmutableOperation;
    recordApplied(record: ExternalOperationRecord & {
        receipt: BackendWriteReceipt;
    }): Promise<void>;
}
