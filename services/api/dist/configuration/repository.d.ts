import type { DatabaseSync } from "node:sqlite";
import type { ConfigurationRequestView } from "@sciencediscovery/schema";
import type { ConfigurationApplyReceipt, ConfigurationOutboxRecord, ConfigurationRecord, ConfigurationVerificationAttempt } from "./types.js";
export declare class ConfigurationRepository {
    readonly database: DatabaseSync;
    constructor(database: DatabaseSync);
    /** Reuses the host transaction; callbacks must remain synchronous. */
    transaction<T>(action: () => T): T;
    private sync;
    get(id: string, sessionId?: string): ConfigurationRecord | undefined;
    list(sessionId: string): ConfigurationRecord[];
    findActive(sessionId: string, fingerprint: string): ConfigurationRecord | undefined;
    save(record: ConfigurationRecord, expectedStateVersion?: number): void;
    scheduleWork(record: ConfigurationRecord, dueAt?: number): void;
    dueRequests(now?: number, limit?: number): ConfigurationRecord[];
    retireWork(requestId: string): void;
    pendingOutbox(now?: number, limit?: number): ConfigurationOutboxRecord[];
    pendingNotices(limit?: number): Array<{
        request_id: string;
        session_id: string;
        state_version: number;
    }>;
    acknowledgeNotice(id: string, version: number): void;
    getRevision(id: string, revision: number): ConfigurationRecord | undefined;
    saveReceipt(receipt: ConfigurationApplyReceipt): void;
    getReceipt(requestId: string, revision?: number): ConfigurationApplyReceipt | undefined;
    enqueueOutbox(record: ConfigurationOutboxRecord): void;
    getOutbox(id: string): ConfigurationOutboxRecord | undefined;
    listOutbox(filter?: {
        state?: ConfigurationOutboxRecord["state"];
        kind?: ConfigurationOutboxRecord["kind"];
        sessionId?: string;
    }): ConfigurationOutboxRecord[];
    updateOutbox(record: ConfigurationOutboxRecord, expectedState?: ConfigurationOutboxRecord["state"]): boolean;
    completeOutbox(id: string, now?: string): void;
    getIdempotency(scope: string, key: string | undefined, payload: unknown): {
        requestId: string;
        response?: ConfigurationRequestView;
    } | undefined;
    reserveIdempotency(scope: string, key: string | undefined, payload: unknown, requestId: string): void;
    finishIdempotency(scope: string, key: string | undefined, view: ConfigurationRequestView): void;
    finishPendingIdempotency(requestId: string, view: ConfigurationRequestView): void;
    saveVerificationAttempt(attempt: ConfigurationVerificationAttempt): void;
    getVerificationAttempt(id: string): ConfigurationVerificationAttempt | undefined;
    listVerificationAttempts(): ConfigurationVerificationAttempt[];
    deleteSession(sessionId: string): void;
}
