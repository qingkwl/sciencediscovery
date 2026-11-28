import { type IdeaTreePersistence } from "@sciencediscovery/idea-tree";
/** Scope comes from SessionStore; Agent arguments cannot choose filesystem paths. */
export declare function ideaTreeRepositoryForSession(options: {
    url: string;
    token?: string;
    connection?: () => Promise<{
        url: string;
        internalToken: string;
    }>;
}, scope: {
    projectId: string;
    sessionId: string;
}): IdeaTreePersistence;
