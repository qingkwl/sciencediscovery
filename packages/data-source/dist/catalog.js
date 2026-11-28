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
import { createHash } from "node:crypto";
import { sourceOutages } from "./source-outage.js";
function canonicalJson(value) {
    if (Array.isArray(value))
        return `[${value.map(canonicalJson).join(",")}]`;
    if (value && typeof value === "object") {
        return `{${Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
            .join(",")}}`;
    }
    return JSON.stringify(value);
}
function schemaHash(schema) {
    return createHash("sha256").update(canonicalJson(schema)).digest("hex");
}
function stringArray(value) {
    return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}
/** Conservative compatibility check: locally advertised calls must satisfy the remote tool contract. */
export function inputSchemasCompatible(local, remote) {
    if (local.type && remote.type && local.type !== remote.type)
        return false;
    const localProperties = local.properties;
    const remoteProperties = remote.properties;
    if (!localProperties || !remoteProperties || typeof localProperties !== "object" || typeof remoteProperties !== "object"
        || Array.isArray(localProperties) || Array.isArray(remoteProperties)) {
        return schemaHash(local) === schemaHash(remote);
    }
    const localNames = new Set(Object.keys(localProperties));
    const remoteNames = new Set(Object.keys(remoteProperties));
    const remoteAllowsExtra = remote.additionalProperties !== false;
    if (!remoteAllowsExtra && [...localNames].some((name) => !remoteNames.has(name)))
        return false;
    const localRequired = new Set(stringArray(local.required));
    if (stringArray(remote.required).some((name) => !localRequired.has(name)))
        return false;
    return true;
}
function statusFor(manifest, catalog) {
    const toolIds = Object.keys(manifest.tools);
    const server = catalog.servers.find((candidate) => candidate.id === manifest.transport.mcpServerId);
    if (!server || server.error || !server.enabled) {
        return {
            availableTools: [],
            catalogRevision: catalog.revision,
            error: server?.error ?? `MCP server is not available: ${manifest.transport.mcpServerId ?? "(missing id)"}`,
            lastCheckedAt: catalog.loadedAt,
            missingTools: toolIds,
            sourceId: manifest.id,
            status: "unavailable",
        };
    }
    const available = [];
    const missing = [];
    for (const [toolId, tool] of Object.entries(manifest.tools)) {
        const remote = server.tools.find((candidate) => candidate.name === tool.mcpToolName);
        if (remote && inputSchemasCompatible(tool.inputSchema, remote.inputSchema))
            available.push(toolId);
        else
            missing.push(toolId);
    }
    return {
        availableTools: available,
        catalogRevision: catalog.revision,
        ...(missing.length ? { error: `Missing or incompatible MCP tools: ${missing.join(", ")}` } : {}),
        lastCheckedAt: catalog.loadedAt,
        missingTools: missing,
        sourceId: manifest.id,
        status: missing.length ? "degraded" : "ready",
    };
}
export class McpSourceCatalog {
    registry;
    gateway;
    proxyMapProvider;
    onCatalog;
    outages;
    configurationRevision;
    catalog;
    statuses = new Map();
    constructor(registry, gateway, 
    /** Current resolved proxies apply to initial discovery and later refreshes. */
    proxyMapProvider, onCatalog, 
    /** The broker's outage memory. It only decorates `getStatus`, so the
     *  readiness view can report a dead provider without changing the gate:
     *  every caller decides on `status`, which this never touches (#1081). */
    outages = sourceOutages, 
    /** Reject discovery results captured before a configuration/auth mutation. */
    configurationRevision) {
        this.registry = registry;
        this.gateway = gateway;
        this.proxyMapProvider = proxyMapProvider;
        this.onCatalog = onCatalog;
        this.outages = outages;
        this.configurationRevision = configurationRevision;
    }
    apply(catalog) {
        this.onCatalog?.(catalog);
        this.catalog = catalog;
        this.statuses.clear();
        for (const source of this.registry.list()) {
            this.statuses.set(source.manifest.id, statusFor(source.manifest, catalog));
        }
        return structuredClone(catalog);
    }
    async refresh(signal) {
        const revision = this.configurationRevision?.();
        const run = this.gateway.catalog(signal, this.proxyMapProvider?.())
            .then((catalog) => this.applyCurrent(catalog, revision));
        return this.trackInFlight(run);
    }
    async reload(signal) {
        const revision = this.configurationRevision?.();
        const run = this.gateway.reload(this.proxyMapProvider?.(), signal)
            .then((catalog) => this.applyCurrent(catalog, revision));
        return this.trackInFlight(run);
    }
    /** Publish the in-flight snapshot so reloadIfChanged can await it instead
     * of stacking a second full reload behind the boot wave. [W31-④ follow-up] */
    trackInFlight(run) {
        this.inFlight = run;
        return run.finally(() => {
            if (this.inFlight === run)
                this.inFlight = undefined;
        });
    }
    /** [W31-④] Reset-and-reconnect only when something actually changed.
     *
     * The first-chat warmup used to call `reload()` unconditionally: the
     * boot-time refresh had just connected every stdio server (three child
     * processes, ~1.3s), and the warmup's `reload` closed all of them and
     * re-spawned the full set — the "pre-warm" was pure reset. This variant
     * compares the configuration revision that produced the current catalog
     * with the live one: unchanged (and a catalog present) returns the
     * current snapshot with zero reconnects. A revision mismatch or a missing
     * catalog falls through to the full `reload`, so a real configuration
     * change still rebuilds everything exactly as before.
     *
     * [W31-④ follow-up] The warmup can also lose a race with the boot-time
     * refresh itself: with the refresh off the health gate (W31-②) the
     * shell's warmup POST sometimes arrives before the boot wave has applied
     * its catalog — `this.catalog` is still unset, so the check below would
     * fall through and issue a second full reload right behind the first one
     * (observed live: warmup POST right after ready, boot catalog ~1s later,
     * second full wave immediately after). Instead of falling through blind,
     * wait for the in-flight `refresh`/`reload` to settle, then re-check:
     * when the boot wave lands first and the revision matches, the warmup
     * returns the fresh catalog with zero reconnects. */
    async reloadIfChanged(signal) {
        if (this.inFlight)
            await this.inFlight.catch(() => undefined);
        const liveRevision = this.configurationRevision?.();
        if (this.catalog && liveRevision !== undefined && this.catalogRevision === liveRevision) {
            return this.getCatalog();
        }
        return this.reload(signal);
    }
    /** Revision of the configuration that produced the CURRENT catalog snapshot
     * (undefined until the first refresh/reload lands). [W31-④] */
    catalogRevision;
    /** The in-flight refresh/reload (W31-② moved the boot refresh off the
     * health gate, so callers can now overlap it). [W31-④ follow-up] */
    inFlight;
    /** Leave the current registry untouched when an in-flight snapshot expired. */
    applyCurrent(catalog, revision) {
        if (revision !== this.configurationRevision?.()) {
            return { ...catalog, revision: createHash("sha256").update("[]").digest("hex"), servers: [] };
        }
        this.catalogRevision = revision;
        return this.apply(catalog);
    }
    getCatalog() {
        return this.catalog ? structuredClone(this.catalog) : undefined;
    }
    getStatus(sourceId) {
        const status = this.statuses.get(sourceId);
        const base = status ? structuredClone(status) : {
            availableTools: [],
            error: "MCP catalog has not been refreshed",
            lastCheckedAt: new Date(0).toISOString(),
            missingTools: Object.keys(this.registry.get(sourceId).manifest.tools),
            sourceId,
            status: "unavailable",
        };
        // Advisory decoration only: `status`, `error` and `missingTools` are exactly
        // what configuration says they are, so no gate changes behaviour here.
        const lastOutage = this.outages.read(sourceId);
        return lastOutage ? { ...base, lastOutage } : base;
    }
    listStatuses() {
        return this.registry.list().map((source) => this.getStatus(source.manifest.id));
    }
}
