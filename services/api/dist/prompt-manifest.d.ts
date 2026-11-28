import type { CasStore } from "@sciencediscovery/cas";
import type { ChatMessage, EffectiveRuntimeSettings, ModelProfile, ModelUsageStatus, PromptManifest } from "@sciencediscovery/schema";
export interface CreatePromptManifestOptions {
    cas: CasStore;
    error?: string;
    messages: ChatMessage[];
    model: ModelProfile;
    response?: string;
    runtimeSettings: EffectiveRuntimeSettings;
    sessionId: string;
    startedAt: string;
    systemPrompt: string;
    systemPromptVersion: string;
    skillLibraryRefs?: PromptManifest["skillLibraryRefs"];
    skillRefs: PromptManifest["skillRefs"];
    specialistRef?: PromptManifest["specialistRef"];
    turnId: string;
    usage?: {
        costUsd?: number | null;
        inputTokens: number | null;
        outputTokens: number | null;
        totalTokens: number | null;
        usageStatus: ModelUsageStatus;
    };
}
export declare function createPromptManifest(options: CreatePromptManifestOptions): Promise<PromptManifest>;
