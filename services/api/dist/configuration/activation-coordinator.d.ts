import type { ConfigurationApplyReceipt, ConfigurationRecord } from "./types.js";
import type { ConfigurationActivationEvidence } from "./runtime-bridge.js";
export interface ConfigurationActivationHost {
    /** Current Stop/version/approved revision checks, repeated after any asynchronous activation. */
    isCurrent(record: ConfigurationRecord, receipt: ConfigurationApplyReceipt): Promise<boolean>;
    /** Only the approved delta. Do not reload the complete mutable Session configuration. */
    activate(record: ConfigurationRecord, receipt: ConfigurationApplyReceipt): Promise<ConfigurationActivationEvidence>;
    saveActivation(requestId: string, result: {
        state: "active" | "failed" | "suppressed" | "needs_user_action";
        evidence?: ConfigurationActivationEvidence;
        code?: string;
    }): Promise<void>;
    enqueueResume(record: ConfigurationRecord, evidence: ConfigurationActivationEvidence): Promise<void>;
}
/** CFG-T28: saved configuration, active runtime and queued continuation are independent durable stages. */
export declare class ConfigurationActivationCoordinator {
    private readonly host;
    constructor(host: ConfigurationActivationHost);
    activate(record: ConfigurationRecord, receipt: ConfigurationApplyReceipt): Promise<"active" | "failed" | "suppressed" | "needs_user_action">;
}
