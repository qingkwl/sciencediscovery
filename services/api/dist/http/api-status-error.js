// Copyright (C) 2026-2026 Huawei Technologies Co., Ltd
// Licensed under the Apache License, Version 2.0 (the "License");
export class ApiStatusError extends Error {
    statusCode;
    code;
    details;
    constructor(statusCode, message, 
    /** Machine-readable reason, so a client can act on it instead of matching prose. */
    code, 
    /** Structured payload the client needs to offer a next step. */
    details) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
    }
}
