/** Structured classifications only: raw tool text and natural-language keywords are not evidence. */
export declare function configurationDiagnostic(code: string): {
    code: string;
    capabilityIds: string[];
    instruction: string;
};
