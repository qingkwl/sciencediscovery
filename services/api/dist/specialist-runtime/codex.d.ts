import { type CodexOptions, type ThreadOptions, type Thread } from "@openai/codex-sdk";
import type { SpecialistRuntimeAdapter, SpecialistRuntimeRequest, SpecialistEventSink, SpecialistResult } from "./adapter.js";
export declare class CodexRuntimeError extends Error {
}
/** Only inability to run the runtime triggers native fallback. */
export declare class SpecialistUnavailableError extends CodexRuntimeError {
}
export type CodexFactory = (options: CodexOptions, thread: ThreadOptions) => Pick<Thread, "runStreamed">;
export declare class CodexSpecialistAdapter implements SpecialistRuntimeAdapter {
    private readonly factory;
    constructor(factory?: CodexFactory);
    invoke(request: SpecialistRuntimeRequest, sink: SpecialistEventSink): Promise<SpecialistResult>;
}
