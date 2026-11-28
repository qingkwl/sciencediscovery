// Copyright (C) 2026-2026 Huawei Technologies Co., Ltd
// Licensed under the Apache License, Version 2.0 (the "License");
import { createHash } from "node:crypto";
export class ConfigurationError extends Error {
    code;
    status;
    field;
    retryable;
    constructor(code, message, status = 400, field, retryable = false) {
        super(message);
        this.code = code;
        this.status = status;
        this.field = field;
        this.retryable = retryable;
        this.name = "ConfigurationError";
    }
}
export function invalid(message, field) { throw new ConfigurationError("INVALID_CONFIGURATION_INPUT", message, 400, field); }
export function object(value, allowed, name = "input") {
    if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
        invalid(`${name} must be an object`);
    const result = value;
    for (const key of Object.keys(result))
        if (!allowed.includes(key) || ["__proto__", "constructor", "prototype"].includes(key))
            invalid(`Unknown ${name} field: ${key}`, key);
    return result;
}
export function string(value, name, maximum = 2048) {
    if (typeof value !== "string" || value.length === 0 || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value))
        invalid(`Invalid ${name}`, name);
    return value;
}
export function displayText(value, name, maximum = 2048) {
    if (value === "")
        return "";
    return string(value, name, maximum);
}
export function integer(value, name, minimum = 1) {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum)
        invalid(`Invalid ${name}`, name);
    return value;
}
export function canonical(value) {
    if (value === undefined)
        return "null";
    if (value === null || typeof value === "boolean" || typeof value === "string")
        return JSON.stringify(value);
    if (typeof value === "number" && Number.isFinite(value))
        return JSON.stringify(value);
    if (Array.isArray(value))
        return `[${value.map(canonical).join(",")}]`;
    if (typeof value === "object")
        return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
    invalid("Value is not serializable");
}
export function digest(value) { return `sha256:${createHash("sha256").update(canonical(value)).digest("hex")}`; }
