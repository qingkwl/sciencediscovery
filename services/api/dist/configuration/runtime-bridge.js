import { requireSameRun } from "./backend-capabilities.js";
export function assertWaitBinding(expected, actual) {
    for (const key of ["sessionId", "runId", "requestId", "revision", "stopGeneration", "checkpointRef", "committedAt"])
        if (expected[key] !== actual[key])
            throw new Error(`Configuration wait binding mismatch: ${key}`);
}
export function assertJiuwenWaitBinding(expected, actual) {
    assertWaitBinding(expected, actual);
    for (const key of ["upstreamSessionId", "interruptId", "toolCallId", "upstreamCheckpointRef"])
        if (!expected[key] || expected[key] !== actual[key])
            throw new Error(`Configuration interrupt binding mismatch: ${key}`);
}
/** DEV-CFG-04 / CFG-T27: reuse native checkpoint serialization, with explicit durable ordering. */
export async function persistNativeConfigurationWait(input) {
    const stopGeneration = input.generation();
    const committedAt = new Date().toISOString();
    const checkpointRef = await input.commitCheckpoint(stopGeneration, committedAt);
    if (!checkpointRef || input.generation() !== stopGeneration)
        throw new Error("Configuration wait invalidated before checkpoint commit");
    const binding = { sessionId: input.sessionId, runId: input.runId, requestId: input.requestId,
        revision: input.revision ?? 1, stopGeneration, checkpointRef, committedAt };
    await input.commitWait(binding);
    if (input.generation() !== stopGeneration)
        throw new Error("Configuration wait invalidated while committing run binding");
    return binding;
}
export class JiuwenConfigurationRuntimeBridge {
    capabilities;
    host;
    constructor(capabilities, host) {
        this.capabilities = capabilities;
        this.host = host;
    }
    async resume(input) {
        requireSameRun(this.capabilities, input.capabilityId);
        const binding = input.binding;
        if (binding.stopGeneration !== input.generation())
            throw new Error("Configuration wait was stopped");
        if (input.decision === "apply" && (!input.activation || input.activation.requestId !== binding.requestId
            || input.activation.revision !== binding.revision || input.activation.runId !== binding.runId
            || !input.activation.toolCatalogFingerprint || !input.activation.effectiveRevision))
            throw new Error("Matching activation evidence is required before resume");
        const current = await this.host.inspectWait(binding);
        assertJiuwenWaitBinding(binding, current.binding);
        if (!current.checkpointDurable || !current.pendingInterruptIds.includes(binding.interruptId))
            throw new Error("The durable configuration interrupt is no longer pending");
        if (binding.stopGeneration !== input.generation())
            throw new Error("Configuration wait was stopped during reconciliation");
        const resumeKey = `${binding.runId}:${binding.requestId}:${binding.revision}:${binding.stopGeneration}`;
        const result = await this.host.resume({ binding, resumeKey, answers: {
                [binding.interruptId]: { requestId: binding.requestId, revision: binding.revision, decision: input.decision,
                    ...(input.activation ? { receiptId: input.activation.receiptId } : {}) },
            } });
        if (result.resumeKey !== resumeKey || !["queued", "started"].includes(result.state))
            throw new Error("Invalid configuration resume receipt");
        return result;
    }
    async cancel(binding) {
        await this.host.cancel(binding);
    }
}
