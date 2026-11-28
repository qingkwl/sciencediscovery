import type { IdeaTreeSettings } from "@sciencediscovery/schema";
/** Effective tree settings are explicit inputs to the lead and its specialists. */
export declare function ideaTreeLeadInstructions(settings: IdeaTreeSettings | undefined): string;
export declare function ideaTreeRoleInstructions(settings: IdeaTreeSettings | undefined, role: string): string;
