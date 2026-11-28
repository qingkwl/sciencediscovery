import { type BackendConfigurationCapabilities } from "./backend-capabilities.js";
/** DEV-CFG-08: opaque references only; secrets are submitted through their owning credential service. */
export interface BackendWriteOperation {
    backendId: string;
    operationId: string;
    requestId: string;
    revision: number;
    previewDigest: string;
    settingId: string;
    scope: string;
    expectedBackendRevision: string;
    approvedPlan: Record<string, unknown>;
    stopGeneration: number;
}
export interface BackendWriteReceipt {
    backendId: string;
    operationId: string;
    requestId: string;
    revision: number;
    previewDigest: string;
    previousBackendRevision: string;
    backendRevision: string;
}
export type BackendOperationStatus = {
    state: "applied";
    receipt: BackendWriteReceipt;
} | {
    state: "not_executed";
    safeToRetry: boolean;
} | {
    state: "pending" | "unknown";
} | {
    state: "rejected";
    code: string;
};
export interface BackendDispatchAuthorization {
    /** Recheck Stop, approved versions and the worker lease AFTER handshake, immediately before the write dispatch. */
    beforeDispatch(): Promise<boolean>;
}
export declare class BackendDispatchNotAuthorizedError extends Error {
    constructor();
}
export interface BackendControl {
    inspect(): Promise<BackendConfigurationCapabilities>;
    submit(operation: BackendWriteOperation, authorization: BackendDispatchAuthorization): Promise<BackendOperationStatus>;
    queryOperation(operation: BackendWriteOperation): Promise<BackendOperationStatus>;
}
export declare function assertBackendReceipt(operation: BackendWriteOperation, receipt: BackendWriteReceipt): void;
/** No fallback to legacy config.set: it does not provide the required write guarantees. */
export declare class HttpBackendControl implements BackendControl {
    private readonly options;
    constructor(options: {
        baseUrl: string;
        token?: string;
        fetch?: typeof fetch;
    });
    private call;
    inspect(): Promise<BackendConfigurationCapabilities>;
    submit(operation: BackendWriteOperation, authorization: BackendDispatchAuthorization): Promise<BackendOperationStatus>;
    queryOperation(operation: BackendWriteOperation): Promise<BackendOperationStatus>;
    private status;
}
