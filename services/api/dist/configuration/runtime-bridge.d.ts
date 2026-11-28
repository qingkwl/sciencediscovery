import type { BackendConfigurationCapabilities } from "./backend-capabilities.js";
/** Server-only identity: never accept these fields from an Agent or ordinary decision DTO. */
export interface ConfigurationWaitBinding<CheckpointRef = string> {
    sessionId: string;
    runId: string;
    requestId: string;
    revision: number;
    stopGeneration: number;
    checkpointRef: CheckpointRef;
    committedAt: string;
}
export interface JiuwenConfigurationWaitBinding extends ConfigurationWaitBinding {
    upstreamSessionId: string;
    interruptId: string;
    toolCallId: string;
    upstreamCheckpointRef: string;
}
export interface ConfigurationActivationEvidence {
    requestId: string;
    revision: number;
    receiptId: string;
    runId?: string;
    effectiveRevision: string;
    toolCatalogFingerprint: string;
    activatedAt: string;
}
export declare function assertWaitBinding(expected: ConfigurationWaitBinding, actual: ConfigurationWaitBinding): void;
export declare function assertJiuwenWaitBinding(expected: JiuwenConfigurationWaitBinding, actual: JiuwenConfigurationWaitBinding): void;
/** DEV-CFG-04 / CFG-T27: reuse native checkpoint serialization, with explicit durable ordering. */
export declare function persistNativeConfigurationWait<CheckpointRef>(input: {
    sessionId: string;
    runId: string;
    requestId: string;
    revision?: number;
    generation(): number;
    commitCheckpoint(stopGeneration: number, committedAt: string): Promise<CheckpointRef>;
    commitWait(binding: ConfigurationWaitBinding<CheckpointRef>): Promise<void>;
}): Promise<ConfigurationWaitBinding<CheckpointRef>>;
/** A capable host supplies core's actual interrupt endpoints; no chat('continue') fallback exists. */
export interface JiuwenInterruptHost {
    inspectWait(binding: JiuwenConfigurationWaitBinding): Promise<{
        binding: JiuwenConfigurationWaitBinding;
        checkpointDurable: boolean;
        pendingInterruptIds: string[];
    }>;
    resume(input: {
        binding: JiuwenConfigurationWaitBinding;
        resumeKey: string;
        answers: Record<string, {
            requestId: string;
            revision: number;
            decision: "apply" | "dismiss";
            receiptId?: string;
        }>;
    }): Promise<{
        state: "queued" | "started";
        resumeKey: string;
    }>;
    cancel(binding: JiuwenConfigurationWaitBinding): Promise<void>;
}
export declare class JiuwenConfigurationRuntimeBridge {
    private readonly capabilities;
    private readonly host;
    constructor(capabilities: BackendConfigurationCapabilities, host: JiuwenInterruptHost);
    resume(input: {
        binding: JiuwenConfigurationWaitBinding;
        capabilityId: string;
        decision: "apply" | "dismiss";
        generation(): number;
        activation?: ConfigurationActivationEvidence;
    }): Promise<{
        state: "queued" | "started";
        resumeKey: string;
    }>;
    cancel(binding: JiuwenConfigurationWaitBinding): Promise<void>;
}
