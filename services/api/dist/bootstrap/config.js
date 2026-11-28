// Copyright (C) 2026-2026 Huawei Technologies Co., Ltd
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_SYSTEM_QUOTA_SETTINGS, DEFAULT_SYSTEM_TIMEOUT_SETTINGS } from "@sciencediscovery/schema";
import { DEFAULT_AGENT_IDLE_TIMEOUT_MS as DEFAULT_GATEWAY_IDLE_TIMEOUT_MS, DEFAULT_AGENT_TURN_TIMEOUT_MS as DEFAULT_GATEWAY_TURN_TIMEOUT_MS, } from "../native-agent/index.js";
import { AUTH_TOKEN_FILE, resolveBootstrapToken, } from "../http/bootstrap-tokens.js";
import { DEFAULT_WORKSPACE_MAX_BYTES, DEFAULT_WORKSPACE_UPLOAD_MAX_FILE_BYTES, DEFAULT_WORKSPACE_UPLOAD_MAX_REQUEST_BYTES, } from "../workspace-upload.js";
const moduleDirectory = dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = resolve(moduleDirectory, "../../../..");
const DEFAULT_USAGE_EXCHANGE_RATE_URL = "https://api.frankfurter.dev/v2/rate/USD/CNY";
function parseBooleanFlag(value, fallback) {
    const normalized = value?.trim().toLowerCase();
    if (!normalized)
        return fallback;
    if (["1", "true", "yes", "on"].includes(normalized))
        return true;
    if (["0", "false", "no", "off"].includes(normalized))
        return false;
    throw new Error("Boolean environment flags must be one of true/false, yes/no, on/off, or 1/0");
}
export function loadServerConfig(env = process.env) {
    // Keep the single-user control plane local unless deployment explicitly opts in.
    const host = env.SCIENCE_AGENT_HOST?.trim() || "127.0.0.1";
    const rawPort = env.SCIENCE_AGENT_PORT?.trim() || "4310";
    const port = Number(rawPort);
    if (!Number.isInteger(port) || port < 0 || port > 65_535) {
        throw new Error("SCIENCE_AGENT_PORT must be an integer between 0 and 65535");
    }
    const rawPublicPort = env.SCIENCE_AGENT_PUBLIC_PORT?.trim();
    const publicPort = rawPublicPort ? Number(rawPublicPort) : undefined;
    if (publicPort !== undefined && (!Number.isInteger(publicPort) || publicPort < 1 || publicPort > 65_535)) {
        throw new Error("SCIENCE_AGENT_PUBLIC_PORT must be an integer between 1 and 65535");
    }
    const parseTimeoutMilliseconds = (name, fallback) => {
        const raw = env[name]?.trim();
        if (!raw)
            return fallback;
        const value = Number(raw);
        if (!Number.isSafeInteger(value) || value < 0) {
            throw new Error(`${name} must be a non-negative integer number of milliseconds`);
        }
        return value;
    };
    const gatewayIdleTimeoutMs = parseTimeoutMilliseconds("SCIENCE_AGENT_GATEWAY_IDLE_TIMEOUT_MS", DEFAULT_GATEWAY_IDLE_TIMEOUT_MS);
    const gatewayTurnTimeoutMs = parseTimeoutMilliseconds("SCIENCE_AGENT_GATEWAY_TURN_TIMEOUT_MS", DEFAULT_GATEWAY_TURN_TIMEOUT_MS);
    if (gatewayTurnTimeoutMs > 0 && gatewayIdleTimeoutMs > 0 && gatewayTurnTimeoutMs < gatewayIdleTimeoutMs) {
        throw new Error("SCIENCE_AGENT_GATEWAY_TURN_TIMEOUT_MS must be greater than or equal to "
            + "SCIENCE_AGENT_GATEWAY_IDLE_TIMEOUT_MS when both timeouts are finite");
    }
    const runnerExecTimeoutMs = parseTimeoutMilliseconds("SCIENCE_AGENT_EXEC_TIMEOUT_MS", DEFAULT_SYSTEM_TIMEOUT_SETTINGS.runnerExecTimeoutMs);
    const kernelIdleTimeoutMs = parseTimeoutMilliseconds("SCIENCE_AGENT_KERNEL_IDLE_MS", DEFAULT_SYSTEM_TIMEOUT_SETTINGS.kernelIdleTimeoutMs);
    const permissionWaitTimeoutMs = parseTimeoutMilliseconds("SCIENCE_AGENT_PERMISSION_WAIT_TIMEOUT_MS", DEFAULT_SYSTEM_TIMEOUT_SETTINGS.permissionWaitTimeoutMs);
    const usageExchangeRateTtlMs = parseTimeoutMilliseconds("SCIENCE_AGENT_USAGE_EXCHANGE_RATE_TTL_MS", 6 * 60 * 60 * 1000);
    const usageExchangeRateTimeoutMs = parseTimeoutMilliseconds("SCIENCE_AGENT_USAGE_EXCHANGE_RATE_TIMEOUT_MS", 2500);
    const parseByteLimit = (name, fallback) => {
        const raw = env[name]?.trim();
        if (!raw)
            return fallback;
        const value = Number(raw);
        if (!Number.isSafeInteger(value) || value < 0) {
            throw new Error(`${name} must be a non-negative integer number of bytes`);
        }
        return value;
    };
    const runnerMaxWorkspaceBytes = parseByteLimit("SCIENCE_AGENT_MAX_WORKSPACE_BYTES", DEFAULT_SYSTEM_QUOTA_SETTINGS.runnerMaxWorkspaceBytes);
    const runnerMaxOutputBytes = parseByteLimit("SCIENCE_AGENT_MAX_OUTPUT_BYTES", DEFAULT_SYSTEM_QUOTA_SETTINGS.runnerMaxOutputBytes);
    const dataDir = resolve(repositoryRoot, env.SCIENCE_AGENT_DATA_DIR?.trim() || ".sciencediscovery-data");
    // No fixed default credentials: an unset variable means "use the token this
    // installation generated on its first start", never a value an attacker could
    // guess from the source tree.
    const authToken = resolveBootstrapToken(dataDir, AUTH_TOKEN_FILE, env.SCIENCE_AGENT_AUTH_TOKEN);
    return {
        authToken: authToken.token,
        authTokenSource: authToken.source,
        accountsBaseUrl: (env.SCIENCE_AGENT_ACCOUNTS_URL ?? "").trim().replace(/\/+$/u, ""),
        dataDir,
        gatewayIdleTimeoutMs,
        gatewayTurnTimeoutMs,
        host,
        kernelIdleTimeoutMs,
        modelCatalogPath: resolve(repositoryRoot, env.SCIENCE_AGENT_MODEL_CATALOG_PATH?.trim() || "resources/model-catalog/models-dev.json"),
        paperPythonPath: env.SCIENCE_AGENT_PAPER_PYTHON_PATH?.trim()
            ? resolve(repositoryRoot, env.SCIENCE_AGENT_PAPER_PYTHON_PATH.trim())
            : resolve(dataDir, "envs/paper/bin/python"),
        paperWorkerPath: resolve(repositoryRoot, env.SCIENCE_AGENT_PAPER_WORKER_PATH?.trim() || "services/paper/paper_worker.py"),
        // [D3 P2-2] frozen rail: an explicit env override wins, else a
        // sd-services onedir under the data dir (the P2-5 assemble layout)
        // is used when present. SD_SD_SERVICES_FREEZE=0 forces the venv
        // rail (verification window).
        ...(() => {
            const explicit = env.SCIENCE_AGENT_SD_SERVICES_EXE?.trim();
            if (explicit)
                return { paperFrozenCommand: { exe: resolve(repositoryRoot, explicit), args: ["paper"] } };
            if (env.SD_SD_SERVICES_FREEZE === "0")
                return {};
            const frozenExe = resolve(dataDir, "frozen", "sd-services", "sd-services", "sd-services.exe");
            return existsSync(frozenExe) ? { paperFrozenCommand: { exe: frozenExe, args: ["paper"] } } : {};
        })(),
        port,
        ...(publicPort !== undefined ? { publicPort } : {}),
        permissionWaitTimeoutMs,
        runnerExecTimeoutMs,
        runnerMaxOutputBytes,
        runnerMaxWorkspaceBytes,
        runnerToken: env.SCIENCE_AGENT_RUNNER_TOKEN?.trim() || "sciencediscovery-runner-local",
        runnerUrl: env.SCIENCE_AGENT_RUNNER_URL?.trim().replace(/\/$/, "") || "http://127.0.0.1:4311",
        sampleSession: parseBooleanFlag(env.SCIENCE_AGENT_SAMPLE_SESSION, true),
        sshConfigPath: resolve(env.SCIENCE_AGENT_SSH_CONFIG_PATH?.trim() || resolve(homedir(), ".ssh/config")),
        staticDir: resolve(repositoryRoot, env.SCIENCE_AGENT_WEB_DIR?.trim() || "apps/web/dist"),
        workspaceUpload: {
            maxFileBytes: parseByteLimit("SCIENCE_AGENT_WORKSPACE_UPLOAD_MAX_FILE_BYTES", DEFAULT_WORKSPACE_UPLOAD_MAX_FILE_BYTES),
            maxRequestBytes: parseByteLimit("SCIENCE_AGENT_WORKSPACE_UPLOAD_MAX_REQUEST_BYTES", DEFAULT_WORKSPACE_UPLOAD_MAX_REQUEST_BYTES),
            maxWorkspaceBytes: parseByteLimit("SCIENCE_AGENT_WORKSPACE_MAX_BYTES", DEFAULT_WORKSPACE_MAX_BYTES),
        },
        usageExchangeRates: {
            enabled: parseBooleanFlag(env.SCIENCE_AGENT_USAGE_EXCHANGE_RATES_ENABLED, true),
            sourceUrl: env.SCIENCE_AGENT_USAGE_EXCHANGE_RATE_URL?.trim() || DEFAULT_USAGE_EXCHANGE_RATE_URL,
            timeoutMs: usageExchangeRateTimeoutMs,
            ttlMs: usageExchangeRateTtlMs,
        },
        memoryGraph: {
            url: env.SCIENCE_AGENT_MEMORY_GRAPH_URL?.trim().replace(/\/$/, "") || "http://127.0.0.1:17674",
            internalToken: env.SCIENCE_AGENT_MEMORY_GRAPH_INTERNAL_TOKEN?.trim() || "sciencediscovery-memory-graph-local",
            neo4jPassword: env.SCIENCE_AGENT_MEMORY_GRAPH_NEO4J_PASSWORD?.trim() || undefined,
            available: env.SCIENCE_AGENT_MEMORY_GRAPH_AVAILABLE?.trim() !== "0",
        },
        evolve: {
            controlUrl: env.SCIENCE_AGENT_EVOLVE_CONTROL_URL?.trim(),
            controlToken: env.SCIENCE_AGENT_EVOLVE_CONTROL_TOKEN?.trim(),
            url: env.SCIENCE_AGENT_EVOLVE_URL?.trim().replace(/\/$/, "") || "",
            internalToken: env.SCIENCE_AGENT_EVOLVE_INTERNAL_TOKEN?.trim() || "",
            unisolated: parseBooleanFlag(env.SCIENCE_AGENT_EVOLVE_UNISOLATED, false),
        },
    };
}
