import type { CasStore } from "@sciencediscovery/cas";
import { type IdeaTreeArtifactResolver } from "@sciencediscovery/idea-tree";
import type { SessionStore } from "../store.js";
export declare function createIdeaTreeArtifactResolver(store: SessionStore, cas: CasStore): IdeaTreeArtifactResolver;
