import type { SessionRunEvent } from "@sciencediscovery/schema";
/** Root stream of a run's timeline; tool/subagent child streams sit beside it. */
export declare const MAIN_RUN_STREAM = "main";
export interface RunStreamLine {
    createdAt: string;
    event: SessionRunEvent["event"];
    sequence: number;
}
/** Parse one JSONL record, or undefined when the line is blank or torn. */
export declare function parseStreamLine(line: string): RunStreamLine | undefined;
export declare function parseStreamLines(content: string): RunStreamLine[];
export declare function assertValidStreamId(streamId: string): void;
