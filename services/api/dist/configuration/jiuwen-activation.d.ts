import type { RuntimeSettingsOverrides } from "@sciencediscovery/schema";
import type { SessionStore } from "../store.js";
import { nativeToolFingerprint } from "./native-activation.js";
import type { ConfigurationApplyReceipt, ConfigurationRecord } from "./types.js";
import type { ConfigurationActivationEvidence } from "./runtime-bridge.js";
type Descriptor = Parameters<typeof nativeToolFingerprint>[0][number];
/** Admit exactly the approved connector to the existing governed recovery dispatcher. */
export declare function activateJiuwenConnector(input: {
    store: SessionStore;
    sessionId: string;
    runId: string;
    record: ConfigurationRecord;
    receipt: ConfigurationApplyReceipt;
    plugins?: RuntimeSettingsOverrides["plugins"];
    initialTools: readonly Descriptor[];
    activatedTools: Map<string, Descriptor>;
    activateSource(sourceId: string): readonly Descriptor[];
}): ConfigurationActivationEvidence;
export {};
