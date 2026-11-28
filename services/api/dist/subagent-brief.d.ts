import type { JsonSchema, SubagentBrief } from "@sciencediscovery/schema";
export declare function assertValidSubagentOutputSchema(value: unknown): asserts value is JsonSchema;
export declare function validateSubagentOutputValue(value: unknown, schema: JsonSchema): string[];
export declare function normalizeSubagentBrief(value: unknown, options?: {
    version?: number;
}): SubagentBrief | undefined;
