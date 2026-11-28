import type { SpecialistRuntimeAdapter, SpecialistRuntimeRequest, SpecialistEventSink, SpecialistResult } from "./adapter.js";
type Kind = "claude-code" | "acp";
/** Executables are operator-controlled absolute paths, never catalog command/argv.
 * ACP args are operator configuration too. Credentials have a separate env slot. */
export interface ProcessRuntimeOptions {
    binary: string;
    args?: string[];
}
declare abstract class ProcessAdapter implements SpecialistRuntimeAdapter {
    private readonly options?;
    abstract readonly kind: Kind;
    constructor(options?: ProcessRuntimeOptions | undefined);
    invoke(request: SpecialistRuntimeRequest, sink: SpecialistEventSink): Promise<SpecialistResult>;
}
export declare class ClaudeCodeSpecialistAdapter extends ProcessAdapter {
    readonly kind: "claude-code";
}
export declare class AcpSpecialistAdapter extends ProcessAdapter {
    readonly kind: "acp";
}
export {};
