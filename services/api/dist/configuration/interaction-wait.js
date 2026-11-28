export const CONFIGURATION_PENDING_STATES = new Set([
    "collecting_input", "awaiting_confirmation", "needs_fix", "validating", "applying", "failed",
]);
/** All capabilities share this interaction lifecycle; activation timing is independent. */
export function configurationDecisionReady(record) {
    return record.view.state === "dismissed" || record.view.state === "applied"
        && (record.plan.activationMode === "next_run" || record.plan.activationMode === "next_request" || record.plan.activationMode === "next_invocation" || record.plan.activationMode === "next_connection" || record.plan.activationMode === "requires_restart"
            ? record.view.activation.state === "needs_user_action"
            : record.view.activation.state === "active");
}
/** Compatibility projection, not a second request store or connector-specific wait. */
export function listConfigurationInteractions(store, sessionId) {
    const db = store.getConfigurationDatabase();
    const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='configuration_requests_v2'").get();
    const records = exists ? db.prepare("SELECT record_json FROM configuration_requests_v2 WHERE session_id=? ORDER BY rowid DESC")
        .all(sessionId).map(row => JSON.parse(row.record_json)) : [];
    const ids = new Set(records.map(record => record.view.id));
    return [...records.map(record => ({ id: record.view.id, runId: record.view.runId ?? "", state: record.view.state,
            connectorId: record.view.capabilityId === "connector.enable" ? String(record.input.connectorId) : "",
            connectorName: record.view.capabilityId, stopGeneration: record.stopGeneration })),
        ...store.listConnectorConfigurationRequests(sessionId).filter(record => !ids.has(record.id))];
}
export function getConfigurationInteraction(store, sessionId, requestId) {
    const db = store.getConfigurationDatabase();
    const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='configuration_requests_v2'").get();
    const row = exists ? db.prepare("SELECT record_json FROM configuration_requests_v2 WHERE id=? AND session_id=?")
        .get(requestId, sessionId) : undefined;
    if (!row)
        return store.getConnectorConfigurationRequest(sessionId, requestId);
    const record = JSON.parse(row.record_json);
    return { id: record.view.id, runId: record.view.runId ?? "", state: record.view.state,
        connectorId: record.view.capabilityId === "connector.enable" ? String(record.input.connectorId) : "",
        connectorName: record.view.capabilityId, stopGeneration: record.stopGeneration };
}
