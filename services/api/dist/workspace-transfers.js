// Copyright (C) 2026-2026 Huawei Technologies Co., Ltd
// Licensed under the Apache License, Version 2.0 (the "License");
import { randomUUID } from "node:crypto";
import { committedWorkspaceSnapshot, publishWorkspaceFile, streamSnapshotFile, workspaceSnapshotFiles } from "@sciencediscovery/cas";
const terminal = (state) => !["queued", "running"].includes(state);
const validatePath = (path) => {
    if (typeof path !== "string" || !path || path.length > 2000 || path.includes("\\") || path.includes("\0")
        || path.split("/").some((part) => !part || part === "." || part === ".."))
        throw new Error("Transfer requires explicit relative file paths");
};
/** Durable transfer records, with no implicit replay after restart. Byte progress
 * is distinct from publication: only a successful target receipt marks a file complete. */
export class WorkspaceTransfers {
    db;
    versions;
    active = new Map();
    constructor(db, versions) {
        this.db = db;
        this.versions = versions;
        db.exec("CREATE TABLE IF NOT EXISTS workspace_transfers (id TEXT PRIMARY KEY, session TEXT NOT NULL, agent TEXT NOT NULL, record TEXT NOT NULL)");
        for (const row of db.prepare("SELECT record FROM workspace_transfers").all()) {
            const job = JSON.parse(String(row.record));
            if (!terminal(job.state)) {
                job.state = "unknown";
                job.finishedAt = new Date().toISOString();
                job.error = "API restarted; inspect completed files and target state before explicitly retrying. No files were replayed.";
                for (const file of job.progress)
                    if (file.state === "copying")
                        file.state = "unknown";
                this.save(job);
            }
        }
    }
    save(job) {
        this.db.prepare("INSERT OR REPLACE INTO workspace_transfers VALUES (?, ?, ?, ?)").run(job.id, job.sessionId, job.agentId, JSON.stringify(job));
    }
    list(owner) {
        return this.db.prepare("SELECT record FROM workspace_transfers WHERE session = ? AND agent = ? ORDER BY rowid DESC").all(owner.sessionId, owner.agentId)
            .map((row) => JSON.parse(String(row.record)));
    }
    snapshot(sessionId, agentId) {
        const where = agentId === undefined ? "session = ?" : "session = ? AND agent = ?";
        const args = agentId === undefined ? [sessionId] : [sessionId, agentId];
        return this.db.prepare(`SELECT record FROM workspace_transfers WHERE ${where} ORDER BY id`).all(...args)
            .map((row) => JSON.parse(String(row.record)));
    }
    get(id, owner) {
        const row = this.db.prepare("SELECT record FROM workspace_transfers WHERE id = ? AND session = ? AND agent = ?").get(id, owner.sessionId, owner.agentId);
        if (!row)
            throw new Error("Transfer not found for this Agent");
        return JSON.parse(String(row.record));
    }
    start(owner, input, access) {
        if (!Array.isArray(input.files) || !input.files.length || input.files.length > 50)
            throw new Error("Transfer requires 1-50 explicit file mappings");
        if (input.conflict && !["reject", "overwrite"].includes(input.conflict))
            throw new Error("Invalid transfer conflict policy");
        const targets = new Set();
        for (const file of input.files) {
            validatePath(file.sourcePath);
            validatePath(file.targetPath);
            if (targets.has(file.targetPath))
                throw new Error("Duplicate transfer target path");
            targets.add(file.targetPath);
        }
        access.resolve(input.sourceWorkspaceId);
        access.resolve(input.targetWorkspaceId);
        const job = { ...structuredClone(input), ...owner, id: randomUUID(), state: "queued", createdAt: new Date().toISOString(), progress: [] };
        this.save(job);
        const controller = new AbortController();
        const done = Promise.resolve().then(() => this.perform(job, access, controller.signal)).finally(() => this.active.delete(job.id));
        this.active.set(job.id, { controller, done });
        return structuredClone(job);
    }
    async cancel(id, owner) {
        this.get(id, owner);
        const active = this.active.get(id);
        active?.controller.abort();
        await active?.done;
        return this.get(id, owner);
    }
    async wait(id, owner) {
        this.get(id, owner);
        await this.active.get(id)?.done;
        return this.get(id, owner);
    }
    async perform(job, access, signal) {
        try {
            signal.throwIfAborted();
            job.state = "running";
            this.save(job);
            const source = access.resolve(job.sourceWorkspaceId);
            let entries;
            let read;
            if ("root" in source) {
                const tree = access.sourceSnapshot ?? await committedWorkspaceSnapshot(this.versions, source.root);
                job.sourceSnapshotId = tree.digest;
                const manifest = await workspaceSnapshotFiles(this.versions, tree, job.files.map((file) => file.sourcePath));
                entries = manifest.map((file) => ({ path: file.path, size: file.content.size, sha256: file.content.digest.slice(7), executable: file.executable }));
                read = async (path) => streamSnapshotFile(this.versions, manifest.find((file) => file.path === path).content);
            }
            else {
                const snapshot = await source.runner.snapshotRemoteWorkspace(source.workspaceKey, job.files.map((file) => file.sourcePath), signal);
                if (snapshot.workspace !== source.workspaceKey)
                    throw new Error("Runner snapshot Workspace mismatch");
                job.sourceSnapshotId = snapshot.id;
                entries = snapshot.files;
                read = (path) => source.runner.streamWorkspaceSnapshot(snapshot, path, signal);
            }
            for (const entry of entries) {
                validatePath(entry.path);
                if (!Number.isSafeInteger(entry.size) || entry.size < 0 || !/^[a-f0-9]{64}$/.test(entry.sha256))
                    throw new Error("Invalid source snapshot manifest");
            }
            const destinations = new Set();
            job.progress = job.files.flatMap((file) => {
                const selected = entries.filter((item) => item.path === file.sourcePath || item.path.startsWith(`${file.sourcePath}/`));
                if (!selected.length)
                    throw new Error(`Source file is absent from snapshot: ${file.sourcePath}`);
                return selected.map((entry) => {
                    const targetPath = file.targetPath + entry.path.slice(file.sourcePath.length);
                    validatePath(targetPath);
                    if (destinations.has(targetPath))
                        throw new Error("Expanded transfer paths overlap at the target");
                    destinations.add(targetPath);
                    return { sourcePath: entry.path, targetPath, size: entry.size, sha256: entry.sha256, bytes: 0, state: "pending" };
                });
            });
            this.save(job);
            for (const file of job.progress) {
                signal.throwIfAborted();
                access.resolve(job.sourceWorkspaceId);
                const target = access.resolve(job.targetWorkspaceId);
                file.state = "copying";
                this.save(job);
                let transmitted = 0;
                const self = this;
                const observed = (async function* () {
                    const chunks = await read(file.sourcePath);
                    for await (const chunk of chunks) {
                        signal.throwIfAborted();
                        access.resolve(job.sourceWorkspaceId);
                        access.resolve(job.targetWorkspaceId);
                        transmitted += chunk.byteLength;
                        file.bytes = transmitted;
                        self.save(job);
                        yield chunk;
                    }
                })();
                try {
                    const executable = entries.find((entry) => entry.path === file.sourcePath).executable;
                    if ("root" in target)
                        await publishWorkspaceFile({ root: target.root, path: file.targetPath, chunks: observed,
                            expectedBytes: file.size, expectedHash: file.sha256, executable, versions: this.versions,
                            conflict: job.conflict ?? "reject", signal });
                    else
                        await target.runner.uploadWorkspaceSnapshotFile(target.workspaceKey, file.targetPath, observed, { size: file.size, sha256: file.sha256, executable }, job.conflict ?? "reject", signal);
                    file.state = "completed";
                    this.save(job);
                    await access.committed?.(file, structuredClone(job));
                }
                catch (error) {
                    // A lost remote response can follow a successful publication; never call that rollback.
                    if (file.state !== "completed")
                        file.state = "root" in target && error.code !== "PUBLICATION_UNCONFIRMED"
                            ? (signal.aborted ? "cancelled" : "failed") : "unknown";
                    file.error = error instanceof Error ? error.message : "Transfer failed";
                    throw error;
                }
            }
            job.state = "completed";
        }
        catch (error) {
            job.error = error instanceof Error ? error.message : "Transfer failed";
            const errorCode = error?.code;
            if (typeof errorCode === "string")
                job.errorCode = errorCode;
            job.state = job.progress.some((file) => file.state === "unknown") ? "unknown"
                : job.progress.some((file) => file.state === "completed") ? "partial" : signal.aborted ? "cancelled" : "failed";
            if (signal.aborted)
                for (const file of job.progress)
                    if (file.state === "pending")
                        file.state = "cancelled";
        }
        finally {
            job.finishedAt = new Date().toISOString();
            this.save(job);
        }
    }
}
