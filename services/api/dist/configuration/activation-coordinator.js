/** CFG-T28: saved configuration, active runtime and queued continuation are independent durable stages. */
export class ConfigurationActivationCoordinator {
    host;
    constructor(host) {
        this.host = host;
    }
    async activate(record, receipt) {
        if (receipt.requestId !== record.view.id || receipt.revision !== record.approvedRevision
            || receipt.previewDigest !== record.approvedDigest || receipt.stopGeneration !== record.stopGeneration)
            throw new Error("Activation receipt does not match the approved request");
        if (!await this.host.isCurrent(record, receipt)) {
            await this.host.saveActivation(record.view.id, { state: "suppressed", code: "activation_baseline_changed" });
            return "suppressed";
        }
        if (record.plan.activationMode === "next_run" || record.plan.activationMode === "next_request" || record.plan.activationMode === "next_invocation" || record.plan.activationMode === "next_connection" || record.plan.activationMode === "requires_restart") {
            await this.host.saveActivation(record.view.id, { state: "needs_user_action", code: record.plan.activationMode });
            return "needs_user_action";
        }
        let evidence;
        try {
            evidence = await this.host.activate(record, receipt);
            if (evidence.requestId !== record.view.id || evidence.revision !== receipt.revision || evidence.receiptId !== receipt.id
                || evidence.runId !== record.view.runId || !evidence.effectiveRevision || !evidence.toolCatalogFingerprint)
                throw new Error("Target runtime activation evidence is incomplete");
        }
        catch {
            await this.host.saveActivation(record.view.id, { state: "failed", code: "activation_not_verified" });
            return "failed";
        }
        if (!await this.host.isCurrent(record, receipt)) {
            await this.host.saveActivation(record.view.id, { state: "suppressed", code: "activation_baseline_changed" });
            return "suppressed";
        }
        await this.host.saveActivation(record.view.id, { state: "active", evidence });
        if (record.view.runId)
            await this.host.enqueueResume(record, evidence);
        return "active";
    }
}
