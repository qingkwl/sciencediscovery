/** Called only behind the normal control-plane bearer-token check. */
export async function handleExecutionReadiness(request, response, url, store, local, remote, read) {
    const probe = url.pathname.match(/^\/api\/runners\/([^/]+)\/execution-capability$/);
    const decision = url.pathname.match(/^\/api\/sessions\/([^/]+)\/execution-blocks(?:\/([^/]+))?$/);
    if (!probe && !decision)
        return false;
    const send = (status, value) => { response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(value)); };
    if (probe && ["GET", "POST"].includes(request.method ?? "")) {
        const runnerId = decodeURIComponent(probe[1]);
        try {
            const client = runnerId === "local" ? local : remote.runnerClient(runnerId);
            // Never substitute a local probe for an unavailable remote Runner.
            const capability = await client.executionCapability(request.method === "POST");
            send(200, { runnerId, connected: true, capability });
        }
        catch (error) {
            send(200, { runnerId, connected: false, reason: error instanceof Error ? error.message : String(error) });
        }
        return true;
    }
    if (decision) {
        const sessionId = decodeURIComponent(decision[1]);
        if (!store.getSession(sessionId)) {
            send(404, { error: "Session not found" });
            return true;
        }
        if (request.method === "GET" && !decision[2]) {
            send(200, store.executionBlocks.list(sessionId));
            return true;
        }
        if (request.method === "POST" && decision[2]) {
            const choice = await read();
            if (!choice || typeof choice !== "object" || !["retry", "cancel", "switch"].includes(choice.action)) {
                send(400, { error: "Invalid execution decision" });
                return true;
            }
            try {
                store.assertSessionWritable(sessionId);
                if (choice.action === "switch")
                    store.assertSessionAllowsRunner(sessionId, choice.runnerId);
                store.executionBlocks.decide(sessionId, decodeURIComponent(decision[2]), choice);
                send(200, { resolved: true });
            }
            catch (error) {
                send(409, { error: String(error) });
            }
            return true;
        }
    }
    send(405, { error: "Method not allowed" });
    return true;
}
