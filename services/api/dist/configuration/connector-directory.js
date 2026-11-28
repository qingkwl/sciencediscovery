// Copyright (C) 2026-2026 Huawei Technologies Co., Ltd
// Licensed under the Apache License, Version 2.0 (the "License");
import { filterEnabledMcpSources } from "@sciencediscovery/mcp-sources";
export const CONFIGURATION_CONNECTOR_DISCOVERY_INSTRUCTIONS = "When a task needs configuration or an installed resource seems missing, use configuration(search), then describe if needed and propose a user choice. Query actual readiness and activation timing; never guess IDs, repeat declined changes, collect keys in chat or treat network errors as permission to weaken settings.";
export function configurationConnectorReadinessReason(status) {
    if (status.status === "ready")
        return undefined;
    if (status.error === "MCP connection timeout")
        return "MCP_CONNECTION_TIMEOUT";
    if (status.status === "authentication_required" || status.status === "unauthorized")
        return "MCP_AUTHENTICATION_REQUIRED";
    if (status.status === "disabled")
        return "MCP_SERVER_DISABLED";
    if (status.status === "missing_tools")
        return "MCP_TOOLS_MISSING";
    return "MCP_UNAVAILABLE";
}
/** One directory drives generic inspection and legacy proposal descriptions. */
export function configurationConnectorDirectory(input) {
    return input.registrations.map(registration => {
        const runtimeEnabled = input.runtimeEnabledConnectorIds?.includes(registration.id) === true;
        const runtimePolicyAllowed = filterEnabledMcpSources([registration.id], input.runtimePlugins).includes(registration.id);
        const sessionPolicyAllowed = filterEnabledMcpSources([registration.id], input.sessionPlugins).includes(registration.id);
        const policyAllowed = runtimePolicyAllowed && sessionPolicyAllowed;
        const sameRunSupported = input.nativeExecutor && registration.sameRunSupported;
        const unavailableReason = runtimeEnabled ? "ALREADY_AVAILABLE_IN_THIS_RUN" : !registration.ready ? "CONNECTOR_NOT_READY"
            : input.runBound && input.runtimeEnabledConnectorIds === undefined ? "RUNTIME_SOURCE_SET_UNVERIFIED"
                : !policyAllowed ? "CONNECTOR_POLICY_BLOCKED" : input.runBound && !sameRunSupported ? "SAME_RUN_ACTIVATION_UNSUPPORTED" : undefined;
        return { ...registration, installed: true, sameRunSupported, runtimeEnabled,
            runtimeStateKnown: input.runtimeEnabledConnectorIds !== undefined, sessionEnabled: input.sessionEnabledConnectorIds.includes(registration.id),
            runtimePolicyAllowed, sessionPolicyAllowed, policyAllowed, canPropose: unavailableReason === undefined,
            activationMode: sameRunSupported && input.runBound ? "same_run" : "next_run",
            ...(unavailableReason ? { unavailableReason } : {}) };
    }).sort((a, b) => a.id.localeCompare(b.id));
}
