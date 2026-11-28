import { type EvolveDirectionInput, type ModelProfile, type Session } from "@sciencediscovery/schema";
import type { SessionStore } from "../store.js";
export declare function parseEvolveDirectionDraft(content: string): EvolveDirectionInput | undefined;
export declare function draftEvolveDirection(store: SessionStore, session: Session, model: ModelProfile, apiToken: string, task: string, signal: AbortSignal): Promise<EvolveDirectionInput | undefined>;
