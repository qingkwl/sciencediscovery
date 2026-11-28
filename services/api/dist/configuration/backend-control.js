// Copyright (C) 2026-2026 Huawei Technologies Co., Ltd
// Licensed under the Apache License, Version 2.0 (the "License");
import { requireExternalControl } from "./backend-capabilities.js";
export class BackendDispatchNotAuthorizedError extends Error {
    constructor() { super("Configuration write dispatch is no longer authorized"); this.name = "BackendDispatchNotAuthorizedError"; }
}
export function assertBackendReceipt(operation, receipt) {
    if (receipt.backendId !== operation.backendId || receipt.operationId !== operation.operationId
        || receipt.requestId !== operation.requestId || receipt.revision !== operation.revision
        || receipt.previewDigest !== operation.previewDigest || receipt.previousBackendRevision !== operation.expectedBackendRevision
        || !receipt.backendRevision || receipt.backendRevision === receipt.previousBackendRevision)
        throw new Error("Backend receipt does not match the approved immutable operation");
}
/** No fallback to legacy config.set: it does not provide the required write guarantees. */
export class HttpBackendControl {
    options;
    constructor(options) {
        this.options = options;
    }
    async call(path, body) {
        const response = await (this.options.fetch ?? fetch)(`${this.options.baseUrl.replace(/\/+$/, "")}/agent/configuration/${path}`, {
            method: body === undefined ? "GET" : "POST", redirect: "error", signal: AbortSignal.timeout(10_000),
            headers: { "content-type": "application/json", ...(this.options.token ? { authorization: `Bearer ${this.options.token}` } : {}) },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        if (!response.ok)
            throw new Error(`Configuration control HTTP ${response.status}`);
        return response.json();
    }
    async inspect() {
        const { parseBackendCapabilities } = await import("./backend-capabilities.js");
        return parseBackendCapabilities(await this.call("capabilities"));
    }
    async submit(operation, authorization) {
        const capabilities = await this.inspect();
        if (capabilities.backendId !== operation.backendId)
            throw new Error("Backend identity mismatch");
        requireExternalControl(capabilities, operation.settingId, operation.scope);
        // Capability inspection is asynchronous: a Stop during it must prevent the subsequent write.
        if (!await authorization.beforeDispatch())
            throw new BackendDispatchNotAuthorizedError();
        return this.status(await this.call("operations/submit", operation), operation);
    }
    async queryOperation(operation) {
        return this.status(await this.call("operations/query", { operationId: operation.operationId, previewDigest: operation.previewDigest }), operation);
    }
    status(value, operation) {
        if (!value || typeof value !== "object")
            throw new Error("Invalid backend operation status");
        const s = value;
        if (s.state === "applied") {
            assertBackendReceipt(operation, s.receipt);
            return s;
        }
        if (s.state === "pending" || s.state === "unknown")
            return { state: s.state };
        if (s.state === "not_executed" && typeof s.safeToRetry === "boolean")
            return s;
        if (s.state === "rejected" && typeof s.code === "string")
            return s;
        throw new Error("Invalid backend operation status");
    }
}
