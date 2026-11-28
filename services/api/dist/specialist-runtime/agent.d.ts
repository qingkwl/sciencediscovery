import type { SpecialistRuntime } from "@sciencediscovery/schema";
import { type NativeAgentHandle, type NativeAgentOptions } from "../native-agent/index.js";
import type { SpecialistRuntimeAdapter, SpecialistRuntimeEvent } from "./adapter.js";
/** Replace only the model-loop factory; execution and artifact bindings remain platform-owned. */
export declare function codexAgentFactory(config: {
    model?: string;
    readRuntime?(): Exclude<SpecialistRuntime, {
        kind: "native";
    }> | undefined;
    runtime?: Exclude<SpecialistRuntime, {
        kind: "native";
    }>;
    configure?(runtime: Exclude<SpecialistRuntime, {
        kind: "native";
    }>): Promise<void>;
    authorizeDirect?(): Promise<void>;
    fallbackFactory?: (options: NativeAgentOptions) => NativeAgentHandle;
    maxTurns: number;
    credential(signal: AbortSignal, needInput: () => Promise<void>): Promise<string>;
    onRuntimeEvent(event: SpecialistRuntimeEvent): Promise<void>;
    adapter?: SpecialistRuntimeAdapter;
}): (options: NativeAgentOptions) => NativeAgentHandle;
