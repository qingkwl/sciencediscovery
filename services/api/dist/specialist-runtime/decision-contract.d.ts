import type { SpecialistRuntimeRequest } from "./adapter.js";
export declare const platformDecisionSchema: {
    type: string;
    additionalProperties: boolean;
    required: string[];
    properties: {
        summary: {
            type: string;
        };
        tools: {
            type: string;
            items: {
                type: string;
                additionalProperties: boolean;
                required: string[];
                properties: {
                    tool: {
                        type: string;
                    };
                    arguments: {
                        type: string;
                    };
                };
            };
        };
    };
};
export declare const decisionInstructions = "Return ONLY JSON with summary and tools: an ordered array of {tool, arguments}, where arguments is a JSON-encoded object. Request all known platform calls for this turn; they execute serially in array order. Use tools=[] and summary=final answer to finish. Never use native tools. Product files are in the platform Workspace.";
export declare const decisionCorrection = "Invalid platform decision (JSON, shape, unavailable platform tool or invalid platform tool arguments). Nothing from this decision was executed. Correct the entire decision once, preserving every intended legal call. Use only the listed tools and their argument schemas. Return ONLY JSON matching the decision schema.";
export declare class PlatformDecisionError extends Error {
}
/** Validate the entire batch before any call can reach platform bindings. */
export declare function parsePlatformDecision(output: string, tools: SpecialistRuntimeRequest["tools"]): {
    summary: string;
    calls: {
        tool: import("@sciencediscovery/tools").AgentTool<import("typebox").TSchema>;
        args: Record<string, unknown>;
    }[];
};
