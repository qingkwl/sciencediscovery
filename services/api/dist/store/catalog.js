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
import { DEFAULT_ENABLED_CONNECTOR_IDS, DEFAULT_SANDBOX_NETWORK_SETTINGS, DEFAULT_SYSTEM_QUOTA_SETTINGS, DEFAULT_ENVIRONMENT_SOURCE_SETTINGS, DEFAULT_IDEA_TREE_SETTINGS, DEFAULT_REVIEWER_SPECIALIST_LEVEL, DEFAULT_REVIEWER_SPECIALIST_SETTINGS, DEFAULT_SYSTEM_TIMEOUT_SETTINGS, DEFAULT_MEMORY_GRAPH_SETTINGS, DEFAULT_WEB_SETTINGS, } from "@sciencediscovery/schema";
import { defaultEnvironmentRevision, defaultShellEnvironmentRevision } from "@sciencediscovery/executor";
import { BUILTIN_SPECIALISTS } from "@sciencediscovery/specialist";
export function emptyCatalog(initialTimeoutSettings = DEFAULT_SYSTEM_TIMEOUT_SETTINGS, initialQuotaSettings = DEFAULT_SYSTEM_QUOTA_SETTINGS) {
    return {
        artifactAnnotations: [],
        artifactVersions: [],
        artifacts: [],
        subagents: [],
        environments: [],
        environmentRevisions: [defaultEnvironmentRevision(), defaultShellEnvironmentRevision()],
        environmentSourceSettings: structuredClone(DEFAULT_ENVIRONMENT_SOURCE_SETTINGS),
        // Skill selection starts at the Project layer, so Global carries no skill fields.
        globalSettings: {
            enabledConnectorIds: [...DEFAULT_ENABLED_CONNECTOR_IDS],
            semanticReviewEnabled: true,
        },
        ideaTreeSettings: structuredClone(DEFAULT_IDEA_TREE_SETTINGS),
        mcpProxyPolicies: {},
        memoryGraphSettings: structuredClone(DEFAULT_MEMORY_GRAPH_SETTINGS),
        npuDeviceSelections: {},
        models: [],
        permissionEpochs: [],
        providers: [],
        proxyDefaultPolicy: `proxy:${ENVIRONMENT_PROXY_SERVER_ID}`,
        proxyServers: [environmentProxyServer()],
        permissionGrants: [],
        permissionRequests: [],
        projects: [],
        quotaSettings: structuredClone(initialQuotaSettings),
        sandboxNetworkSettings: structuredClone(DEFAULT_SANDBOX_NETWORK_SETTINGS),
        reviewerSpecialistEnabled: DEFAULT_REVIEWER_SPECIALIST_SETTINGS.enabled,
        reviewerSpecialistFeedbackPolicy: DEFAULT_REVIEWER_SPECIALIST_SETTINGS.feedbackPolicy,
        reviewerSpecialistLevel: DEFAULT_REVIEWER_SPECIALIST_LEVEL,
        reviewerSpecialistDefaultOnMigrated: true,
        remoteHosts: [],
        remoteJobs: [],
        remoteWorkspaceSyncs: [],
        sessions: [],
        // Built-in specialists are seeded (read-only) and all enabled by default
        // (no `enabled` key means enabled).
        specialists: BUILTIN_SPECIALISTS.map((specialist) => ({ ...structuredClone(specialist) })),
        timeoutSettings: structuredClone(initialTimeoutSettings),
        webSettings: structuredClone(DEFAULT_WEB_SETTINGS),
        workspaceFileRecords: [],
        workspaceFileRevisions: [],
    };
}
/** Seeded registry entry preserving the historical default of trusting the
 *  process proxy environment variables. Editable and deletable like any
 *  other entry once operators take over the registry. */
export const ENVIRONMENT_PROXY_SERVER_ID = "environment";
export function environmentProxyServer() {
    const now = new Date().toISOString();
    return {
        createdAt: now,
        hasUrl: false,
        id: ENVIRONMENT_PROXY_SERVER_ID,
        kind: "environment",
        name: "Environment variables",
        updatedAt: now,
    };
}
export function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function hasOwn(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
}
