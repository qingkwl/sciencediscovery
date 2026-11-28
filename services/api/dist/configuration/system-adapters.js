// Copyright (C) 2026-2026 Huawei Technologies Co., Ltd
// Licensed under the Apache License, Version 2.0 (the "License");
import { createHash } from "node:crypto";
import { ENVIRONMENT_CONDA_SOURCE_PRESETS, ENVIRONMENT_PIP_SOURCE_PRESETS } from "@sciencediscovery/schema";
import { normalizeIdeaTreeSettings, normalizeQuotaSettings, normalizeTimeoutSettings, resolveIdeaTreeSettings } from "../store/settings.js";
import { normalizeEnvironmentSourceSettings } from "../environment-sources.js";
import { CONFIGURATION_AGENT_DESCRIPTORS, SYSTEM_CONFIGURATION_CAPABILITIES } from "./agent-metadata.js";
import { ConfigurationError, invalid, object } from "./validation.js";
const noProbe = { targets: [], actions: [], maxRequests: 0, mayCharge: false };
const intensities = ["quick", "standard", "deep"];
const directions = ["maximize", "minimize"];
function domainError(error) {
    const message = error instanceof Error ? error.message : "Invalid system setting";
    throw new ConfigurationError("INVALID_CONFIGURATION_INPUT", message, 400);
}
function integerValue(value, name, minimum, maximum) {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || (maximum !== undefined && value > maximum)) {
        invalid(maximum === undefined ? `${name} must be an integer of at least ${minimum}` : `${name} must be an integer from ${minimum} to ${maximum}`, name);
    }
    return value;
}
function normalized(id, raw) {
    const descriptor = CONFIGURATION_AGENT_DESCRIPTORS[id];
    if (!descriptor)
        invalid("This configuration capability is not available");
    const input = object(raw, Object.keys(descriptor.fields), "values");
    const output = {};
    for (const [key, value] of Object.entries(input)) {
        const field = descriptor.fields[key];
        if (field.kind === "integer")
            output[key] = integerValue(value, key, field.minimum ?? 0, field.maximum);
        else if (typeof value === "string" && field.choices?.includes(value))
            output[key] = value;
        else
            invalid("Invalid registered setting", key);
    }
    return output;
}
function numberField(id, label, value, description) {
    return { id, label, kind: "number", required: false, value, description };
}
function enumField(id, label, choices, value) {
    return { id, label, kind: "enum", required: false, value, choices: choices.map(choice => ({ id: choice, label: choice })) };
}
function currentTimeouts(snapshot) {
    return normalizeTimeoutSettings(snapshot.data.timeoutSettings);
}
function currentQuotas(snapshot) {
    return normalizeQuotaSettings(snapshot.data.quotaSettings);
}
function currentIdeaTree(snapshot) {
    return resolveIdeaTreeSettings(snapshot.data.ideaTreeSettings);
}
function changed(input, current) {
    const source = current;
    return Object.entries(input).filter(([field, value]) => source[field] !== value)
        .map(([field, value]) => ({ field, before: JSON.stringify(source[field] ?? null), after: JSON.stringify(value) }));
}
export function createSystemConfigurationAdapters(store) {
    const checked = (id, input, snapshot) => {
        try {
            if (id === "timeouts.configure")
                normalizeTimeoutSettings({ ...currentTimeouts(snapshot), ...input });
            else if (id === "quotas.configure")
                normalizeQuotaSettings({ ...currentQuotas(snapshot), ...input });
            else if (id === "environment.sources")
                normalizeEnvironmentSourceSettings({ ...normalizeEnvironmentSourceSettings(snapshot.data.environmentSourceSettings), ...input });
            else
                normalizeIdeaTreeSettings(input, currentIdeaTree(snapshot));
        }
        catch (error) {
            domainError(error);
        }
    };
    return SYSTEM_CONFIGURATION_CAPABILITIES.map((id) => ({
        id, version: 1, schemaVersion: 1, scopes: ["global"], persistence: "local_transaction",
        normalize: raw => normalized(id, raw),
        target: () => id,
        preview: (input, snapshot) => {
            checked(id, input, snapshot);
            const fields = [];
            let message;
            if (id === "environment.sources") {
                const current = { ...normalizeEnvironmentSourceSettings(snapshot.data.environmentSourceSettings), ...input };
                message = "Deployment-wide package-source defaults. Subsequent environment preparation and package installation read the saved presets; an operation already submitted keeps its resolved source. Existing environments and installed packages are unchanged. Saving does not download, install or authorize package execution.";
                fields.push(enumField("pipSource", "pip package source", ENVIRONMENT_PIP_SOURCE_PRESETS.map(preset => preset.id), current.pipSource), enumField("condaSource", "conda package source", ENVIRONMENT_CONDA_SOURCE_PRESETS.map(preset => preset.id), current.condaSource));
            }
            else if (id === "timeouts.configure") {
                const current = { ...currentTimeouts(snapshot), ...input };
                message = "Deployment-wide. A run keeps the timeouts it read when it started; a later run reads the saved values. 0 disables that one limit. A single timeout is not a reason to remove a limit.";
                fields.push(numberField("gatewayIdleTimeoutMs", "Gateway idle timeout (ms)", current.gatewayIdleTimeoutMs, "0 disables the idle limit."), numberField("gatewayTurnTimeoutMs", "Gateway turn timeout (ms)", current.gatewayTurnTimeoutMs, "0 disables the turn limit. When both are set, the turn limit is at least the idle limit."), numberField("kernelIdleTimeoutMs", "Kernel idle timeout (ms)", current.kernelIdleTimeoutMs, "0 disables the kernel idle limit."), numberField("permissionWaitTimeoutMs", "Permission wait timeout (ms)", current.permissionWaitTimeoutMs, "0 disables the permission-wait limit."), numberField("runnerExecTimeoutMs", "Runner execution timeout (ms)", current.runnerExecTimeoutMs, "0 disables the runner execution limit."));
            }
            else if (id === "quotas.configure") {
                const current = { ...currentQuotas(snapshot), ...input };
                message = "Deployment-wide. A later run reads these limits when it starts. 0 on a byte field removes that cap. Concurrent subagents stay from 1 to 10.";
                fields.push(numberField("maxConcurrentSubagents", "Concurrent subagents", current.maxConcurrentSubagents ?? 10, "Integer from 1 to 10."), numberField("runnerMaxOutputBytes", "Runner output cap (bytes)", current.runnerMaxOutputBytes, "0 removes the output cap."), numberField("runnerMaxWorkspaceBytes", "Runner workspace cap (bytes)", current.runnerMaxWorkspaceBytes, "0 removes the workspace cap."), numberField("uploadMaxFileBytes", "Upload file cap (bytes)", current.uploadMaxFileBytes, "0 removes the per-file cap."), numberField("uploadMaxRequestBytes", "Upload request cap (bytes)", current.uploadMaxRequestBytes, "0 removes the request cap."));
            }
            else {
                const current = normalizeIdeaTreeSettings(input, currentIdeaTree(snapshot));
                message = "Deployment-wide. A later idea-tree invocation reads these limits. Template and exploration intensity choose research budgets and assessor definitions. An idea-tree run already in progress keeps the settings it started with.";
                fields.push({ id: "templateId", label: "Research template", kind: "enum", required: false, value: current.templateId, choices: [
                        { id: "scientific-hypothesis-general/v1", label: "General scientific hypothesis" },
                        { id: "water-treatment-materials/v1", label: "Water-treatment materials" },
                    ] }, enumField("explorationIntensity", "Exploration intensity", intensities, current.explorationIntensity), enumField("scoreDirection", "Score direction", directions, current.scoreDirection), numberField("maxDepth", "Maximum depth", current.maxDepth, "Integer from 1 to 20."), numberField("maxNodes", "Maximum nodes", current.maxNodes, "Integer from 2 to 10000."));
            }
            const current = id === "environment.sources" ? normalizeEnvironmentSourceSettings(snapshot.data.environmentSourceSettings)
                : id === "timeouts.configure" ? currentTimeouts(snapshot) : id === "quotas.configure" ? currentQuotas(snapshot) : currentIdeaTree(snapshot);
            const changes = changed(input, current);
            return { fields, changes, impact: { resourceLocation: "Deployment system settings", effectiveScope: "Every session in this deployment", message: message + " Saving does not schedule an unrelated task. An original configuration task already bound to this request may continue through the normal framework with its frozen task settings; this is separate from when the changed setting becomes effective." },
                verificationPlan: noProbe, activationMode: "next_run", disposition: !Object.keys(input).length ? "missing_input" : changes.length ? "change" : "no_change", ready: changes.length > 0 };
        },
        apply: context => {
            try {
                store.applySystemConfigurationSync(id, context.input);
            }
            catch (error) {
                if (error instanceof Error && error.message.includes("shared transaction"))
                    throw error;
                domainError(error);
            }
            return { resourceRevision: createHash("sha256").update(JSON.stringify(store.configurationSnapshot(context.sessionId, id, id).resourceVersions)).digest("hex"),
                summary: "Deployment settings saved for later runs" };
        },
    }));
}
