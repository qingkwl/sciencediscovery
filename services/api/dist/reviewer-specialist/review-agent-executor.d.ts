import { type CreateReviewAgentOptionsInput } from "@sciencediscovery/specialist";
/** Thin API adapter binding the Specialist domain to the local Agent runner. */
export declare function createReviewAgentOptions(input: Omit<CreateReviewAgentOptionsInput, "executeSubagent">): import("@sciencediscovery/provenance").SemanticReviewOptions;
