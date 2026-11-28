import { IdeaTreePersistenceError, IdeaTreeRuntimeError, } from "@sciencediscovery/idea-tree";
/** Scope comes from SessionStore; Agent arguments cannot choose filesystem paths. */
export function ideaTreeRepositoryForSession(options, scope) {
    async function call(operation, params, context = {}) {
        const connection = options.connection ? await options.connection() : { url: options.url, internalToken: options.token };
        if (!connection.url)
            throw new IdeaTreePersistenceError("PERSISTENCE_UNAVAILABLE", "Evolve is not initialized. Select Init Evolve.");
        let response;
        try {
            response = await fetch(`${connection.url.replace(/\/$/, "")}/idea-tree/command`, {
                method: "POST",
                headers: { "content-type": "application/json", ...(connection.internalToken ? { authorization: `Bearer ${connection.internalToken}` } : {}) },
                body: JSON.stringify({ ...scope, ...context, operation, params }),
                signal: AbortSignal.timeout(60_000),
            });
        }
        catch (error) {
            throw new IdeaTreePersistenceError("PERSISTENCE_UNAVAILABLE", `Idea Tree Python service is unavailable: ${String(error)}`);
        }
        const body = await response.json();
        if (!response.ok) {
            throw new IdeaTreeRuntimeError(body.detail?.code ?? "STORAGE_ERROR", body.detail?.message ?? `Idea Tree HTTP ${response.status}`);
        }
        return body.result;
    }
    return {
        key: `python:${scope.projectId}:${scope.sessionId}`, call,
        deleteAll: () => call("deleteAll", {}),
        listTreeIds: () => call("listTreeIds", {}),
        readTree: (treeId) => call("readTree", { treeId }),
        readGraph: (treeId) => call("readGraph", { treeId }),
    };
}
