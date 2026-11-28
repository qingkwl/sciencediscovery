import { canonical, ConfigurationError, digest } from "./validation.js";
function ensureTables(store) {
    store.getConfigurationDatabase().exec(`CREATE TABLE IF NOT EXISTS configuration_native_runs_v3 (
    run_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, record_json TEXT NOT NULL
  ); CREATE TABLE IF NOT EXISTS configuration_native_overlays_v3 (
    request_id TEXT NOT NULL, revision INTEGER NOT NULL, run_id TEXT NOT NULL, session_id TEXT NOT NULL,
    record_json TEXT NOT NULL, PRIMARY KEY(request_id,revision)
  )`);
}
function context(store, sessionId, runId) {
    ensureTables(store);
    const row = store.getConfigurationDatabase().prepare("SELECT record_json FROM configuration_native_runs_v3 WHERE run_id=? AND session_id=?")
        .get(runId, sessionId);
    return row ? JSON.parse(row.record_json) : undefined;
}
/** Evidence from the actual factory, distinct from configured or approved IDs. */
export function nativeRuntimeConnectorIds(store, sessionId, runId) {
    const saved = context(store, sessionId, runId);
    return saved && saved.stopGeneration === store.notifications.generation(sessionId) && store.notifications.canWake(sessionId)
        ? [...saved.enabledConnectorIds] : undefined;
}
/** Persist evidence from the actual executable Native factory, never from Agent-supplied tool names. */
export function recordNativeRunChoiceContext(input) {
    const previous = context(input.store, input.sessionId, input.runId);
    const record = { sessionId: input.sessionId, runId: input.runId,
        stopGeneration: input.store.notifications.generation(input.sessionId), enabledConnectorIds: [...input.enabledConnectorIds],
        webSearchAvailable: input.webSearchAvailable, ...(input.webSearchAvailable ? { webSettingsRevision: digest(input.store.getWebSettings()) } : {}),
        toolCatalogFingerprint: input.toolCatalogFingerprint,
        plugins: structuredClone(input.plugins),
        ...(input.store.configurationRuntimeVersions ? { executionDependencies: input.store.configurationRuntimeVersions(input.enabledConnectorIds, input.plugins, input.sessionId) } : {}),
        ...(previous?.checkpoint ? { checkpoint: previous.checkpoint } : {}) };
    input.store.getConfigurationDatabase().prepare("INSERT INTO configuration_native_runs_v3 (run_id,session_id,record_json) VALUES (?,?,?) ON CONFLICT(run_id) DO UPDATE SET record_json=excluded.record_json")
        .run(input.runId, input.sessionId, JSON.stringify(record));
}
/** Approving a delta cannot silently reapprove changed original tools. */
export function nativeExecutionDependencies(store, record) {
    if (record.view.capabilityId !== "connector.enable" || !record.view.runId)
        return undefined;
    const saved = context(store, record.view.sessionId, record.view.runId);
    if (!saved?.executionDependencies)
        return undefined; // Historical requests retain their stronger legacy comparison.
    if (canonical(saved.executionDependencies) !== canonical(store.configurationRuntimeVersions(saved.enabledConnectorIds, saved.plugins, record.view.sessionId)))
        throw new Error("The original Native execution dependencies changed");
    return store.configurationRuntimeVersions([...new Set([...saved.enabledConnectorIds, String(record.input.connectorId)])], saved.plugins, record.view.sessionId);
}
export function nativeExecutionDependenciesCurrent(store, record, receipt) {
    try {
        return receipt.executionDependencies ? canonical(receipt.executionDependencies) === canonical(nativeExecutionDependencies(store, record))
            : canonical(receipt.resourceVersions) === canonical(store.configurationSnapshot(record.view.sessionId, record.view.capabilityId, record.target).resourceVersions);
    }
    catch {
        return false;
    }
}
/** Called only after the durable model checkpoint and its original run binding were committed. */
export function recordNativeChoiceCheckpoint(input) {
    const record = context(input.store, input.sessionId, input.runId);
    if (!record || record.stopGeneration !== input.stopGeneration || input.stopGeneration !== input.store.notifications.generation(input.sessionId))
        throw new Error("Native configuration choice context was invalidated");
    record.checkpoint = { requestId: input.requestId, historyRef: input.historyRef, committedAt: input.committedAt };
    input.store.getConfigurationDatabase().prepare("UPDATE configuration_native_runs_v3 SET record_json=? WHERE run_id=? AND session_id=?")
        .run(JSON.stringify(record), input.runId, input.sessionId);
}
export function nativeConnectorChoiceOptions(input) {
    const record = input.runId ? context(input.store, input.sessionId, input.runId) : undefined;
    const current = record && record.stopGeneration === input.store.notifications.generation(input.sessionId);
    return [
        { id: "save", kind: "persisted_apply", label: "Enable for this session", description: "Save the session configuration and continue the original task.", available: input.ready },
        ...(current && input.ready ? [{ id: "run-only", kind: "run_overlay", label: "Use for this task only",
                description: "Add this ready connector only to this run. The session, queued runs and later tasks stay unchanged.", available: true }] : []),
        ...(current && record.webSearchAvailable && record.enabledConnectorIds.includes("web")
            && record.webSettingsRevision === digest(input.store.getWebSettings()) ? [{ id: "use-web", kind: "alternative",
                alternativeId: "web-search", label: "Use existing Web search", description: "Keep this connector disabled and continue the original research using the already available Web search. Coverage may differ.", available: true }] : []),
        { id: "dismiss", kind: "dismiss", label: "Not now", description: "Do not change settings. Return this decision to the original task without selecting another source.", available: true },
    ];
}
/** Validate the explicit choice supplied by the current decision operation. */
export function validateNativeChoice(store, record, option) {
    if (!record.view.runId || !option || !["run_overlay", "alternative"].includes(option.kind))
        return;
    const saved = context(store, record.view.sessionId, record.view.runId);
    if (!saved || saved.stopGeneration !== record.stopGeneration || saved.stopGeneration !== store.notifications.generation(record.view.sessionId)
        || !store.notifications.canWake(record.view.sessionId))
        throw new ConfigurationError("CONFIGURATION_CHOICE_UNAVAILABLE", "The original Native task is no longer available for this choice", 409);
    if (option.kind === "alternative" && (option.alternativeId !== "web-search" || !saved.webSearchAvailable || !saved.enabledConnectorIds.includes("web")
        || saved.webSettingsRevision !== digest(store.getWebSettings())))
        throw new ConfigurationError("CONFIGURATION_ALTERNATIVE_UNAVAILABLE", "This task has no verified existing Web search tool", 409);
    if (option.kind === "run_overlay" && (record.view.capabilityId !== "connector.enable" || record.target === "web"))
        throw new ConfigurationError("CONFIGURATION_OVERLAY_UNAVAILABLE", "Task-only use is only supported for ready Native MCP connectors", 409);
}
/** Read-only recovery validates the persisted decision; it never authorizes another apply. */
export function validatePersistedNativeChoice(store, record) {
    validateNativeChoice(store, record, record.view.options?.find(item => item.id === record.view.selectedOptionId));
}
/** Runs inside the same transaction as the decision receipt. No formal configuration setter is called. */
export function applyNativeRunOverlay(store, record, adapterContext) {
    const db = store.getConfigurationDatabase();
    if (!db.isTransaction)
        throw new Error("Native overlay writes require the shared configuration transaction");
    const selectedOption = adapterContext.selectedOption;
    const previewDigest = record.view.previewDigest;
    if (!selectedOption || selectedOption.kind !== "run_overlay" || !selectedOption.available || !previewDigest)
        throw new ConfigurationError("CONFIGURATION_CHOICE_APPROVAL_REQUIRED", "The Native overlay requires an explicitly approved task-only option and preview", 409);
    validateNativeChoice(store, record, selectedOption);
    const saved = context(store, record.view.sessionId, record.view.runId);
    if (!saved?.checkpoint || saved.checkpoint.requestId !== record.view.id)
        throw new ConfigurationError("CONFIGURATION_WAIT_NOT_READY", "The original task has not committed this configuration checkpoint", 409);
    const overlay = { sessionId: record.view.sessionId, runId: record.view.runId, requestId: record.view.id,
        revision: record.view.revision, optionId: selectedOption.id, previewDigest,
        stopGeneration: record.stopGeneration, connectorId: String(record.input.connectorId), checkpoint: saved.checkpoint,
        resourceVersions: adapterContext.snapshot.resourceVersions, createdAt: new Date().toISOString() };
    const existing = db.prepare("SELECT record_json FROM configuration_native_overlays_v3 WHERE request_id=? AND revision=?")
        .get(overlay.requestId, overlay.revision);
    let resourceRevision = digest(overlay);
    if (existing) {
        const prior = JSON.parse(existing.record_json);
        if (canonical({ ...prior, createdAt: "" }) !== canonical({ ...overlay, createdAt: "" }))
            throw new Error("Native overlay approval changed");
        resourceRevision = digest(prior);
    }
    else
        db.prepare("INSERT INTO configuration_native_overlays_v3 (request_id,revision,run_id,session_id,record_json) VALUES (?,?,?,?,?)")
            .run(overlay.requestId, overlay.revision, overlay.runId, overlay.sessionId, JSON.stringify(overlay));
    store.resolveConnectorConfigurationCompanionSync(record.view.sessionId, record.view.id, "applied", "user");
    return { resourceRevision, summary: "Connector approved only for the original task; session settings were not changed." };
}
export function nativeRunOverlay(store, sessionId, runId, requestId) {
    ensureTables(store);
    const row = store.getConfigurationDatabase().prepare("SELECT record_json FROM configuration_native_overlays_v3 WHERE request_id=? AND run_id=? AND session_id=? ORDER BY revision DESC LIMIT 1")
        .get(requestId, runId, sessionId);
    if (!row)
        return undefined;
    const overlay = JSON.parse(row.record_json);
    return overlay.stopGeneration === store.notifications.generation(sessionId) && store.notifications.canWake(sessionId) ? overlay : undefined;
}
/** Adds only individually approved, witnessed increments; the historical settingsSnapshot remains unchanged. */
export function nativeApprovedRunConnectorIds(store, run) {
    const db = store.getConfigurationDatabase();
    const result = new Set(run.settingsSnapshot.enabledConnectorIds);
    if (["completed", "cancelled", "failed", "interrupted"].includes(run.status))
        return [...result];
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='configuration_native_activation_v2'").get())
        return [...result];
    const rows = db.prepare("SELECT record_json FROM configuration_native_activation_v2 WHERE run_id=?").all(run.id);
    for (const row of rows) {
        const witness = JSON.parse(row.record_json);
        if (witness.stopGeneration !== store.notifications.generation(run.sessionId))
            continue;
        const source = db.prepare("SELECT record_json FROM configuration_requests_v2 WHERE id=? AND session_id=?").get(witness.evidence.requestId, run.sessionId);
        if (!source)
            continue;
        const record = JSON.parse(source.record_json);
        if (record.view.runId !== run.id || record.view.state !== "applied" || record.view.activation.state !== "active"
            || record.approvedRevision !== witness.evidence.revision || record.view.capabilityId !== "connector.enable")
            continue;
        if (record.view.choiceReceipt?.kind === "run_overlay" && !nativeRunOverlay(store, run.sessionId, run.id, record.view.id))
            continue;
        result.add(String(record.input.connectorId));
    }
    return [...result];
}
export function nativeConfigurationChoiceRecord(store, sessionId, requestId) {
    const db = store.getConfigurationDatabase();
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='configuration_requests_v2'").get())
        return undefined;
    const row = db.prepare("SELECT record_json FROM configuration_requests_v2 WHERE id=? AND session_id=?").get(requestId, sessionId);
    return row ? JSON.parse(row.record_json) : undefined;
}
