/** Stop waiting, not the underlying write. Keep handlers attached for late failures. */
export declare function waitForRecording<T>(work: Promise<T>, signal: AbortSignal): Promise<T>;
export interface RecordingIdentity {
    sessionId?: string;
    agentId?: string;
    trajectoryId?: string;
    requestId?: string;
    turn?: number;
}
/** Observe actual completion even when the caller has stopped waiting. No research payloads. */
export declare function recordingStage<T>(stage: string, identity: RecordingIdentity, operation: () => Promise<T>, signal?: AbortSignal, slowAfterMs?: number): Promise<T>;
