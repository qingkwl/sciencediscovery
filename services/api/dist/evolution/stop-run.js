/**
 * Stop one search on behalf of the agent's tool.
 *
 * The id arrives from a model whose context routinely is not the store's
 * spelling of it: a search started turns ago, a `subtask:evolve:` handle read
 * off the memory graph. So the prefix is stripped before the lookup, and a miss
 * is answered with the ids this session actually has — the same help
 * `get_evolve_run` gives, because the reader is deciding what to call next.
 *
 * A finished run is not an error: the caller raced the terminal event, and the
 * useful answer is what that run ended as.
 */
export async function stopEvolveRunForSession(runId, deps) {
    const wanted = runId.trim().replace(/^subtask:evolve:/, "");
    const run = await deps.readRun(wanted);
    if (!run || run.sessionId !== deps.sessionId) {
        const known = (await deps.listRuns(deps.sessionId)).slice(0, 8)
            .map((item) => `${item.id}（${item.status}）`).join("、");
        throw new Error(`no such search in this session: ${wanted}. ${known ? `The searches in this session: ${known}` : "This session has no searches yet."}`);
    }
    if (!deps.isActive(run.status))
        return { runId: run.id, status: run.status, stopping: false };
    await deps.stop(run.id);
    return { runId: run.id, status: "stopping", stopping: true };
}
