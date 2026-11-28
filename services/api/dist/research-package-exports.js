// Copyright (C) 2026-2026 Huawei Technologies Co., Ltd
// Licensed under the Apache License, Version 2.0 (the "License");
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { apiLog } from "./logging.js";
const RETENTION_MS = 24 * 60 * 60 * 1000;
/** Runs heavyweight package creation independently of the browser request. */
export class ResearchPackageExports {
    root;
    currentRevision;
    createPackage;
    now;
    tasks = new Map();
    queue = Promise.resolve();
    ready;
    constructor(root, currentRevision, createPackage, now = () => Date.now()) {
        this.root = root;
        this.currentRevision = currentRevision;
        this.createPackage = createPackage;
        this.now = now;
    }
    timestamp() { return new Date(this.now()).toISOString(); }
    isExpired(task) {
        const updatedAt = Date.parse(task.updatedAt);
        return !Number.isFinite(updatedAt) || this.now() - updatedAt > RETENTION_MS;
    }
    async removeTaskFiles(id) {
        await Promise.all([
            rm(resolve(this.root, `${id}.json`), { force: true }),
            rm(resolve(this.root, `${id}.sdresearch`), { force: true }),
        ]);
    }
    async pruneExpiredTasks() {
        for (const task of [...this.tasks.values()]) {
            if (!this.isExpired(task))
                continue;
            this.tasks.delete(task.id);
            await this.removeTaskFiles(task.id);
        }
    }
    initialize() {
        return this.ready ??= (async () => {
            await mkdir(this.root, { recursive: true });
            for (const name of await readdir(this.root)) {
                if (!name.endsWith(".json"))
                    continue;
                const metadataPath = resolve(this.root, name);
                let task;
                try {
                    task = JSON.parse(await readFile(metadataPath, "utf8"));
                }
                catch {
                    await rm(metadataPath, { force: true });
                    continue;
                }
                if (!/^[a-f0-9-]{36}$/.test(task.id ?? "")) {
                    await rm(metadataPath, { force: true });
                    continue;
                }
                if (this.isExpired(task)) {
                    await this.removeTaskFiles(task.id);
                    continue;
                }
                if (task.status === "queued" || task.status === "running") {
                    task = { ...task, status: "failed", error: "服务重启时导出尚未完成，请重新导出。", updatedAt: this.timestamp() };
                    await this.persist(task);
                }
                if (task.status === "completed") {
                    try {
                        await stat(resolve(this.root, `${task.id}.sdresearch`));
                        task.outputPath = resolve(this.root, `${task.id}.sdresearch`);
                    }
                    catch {
                        task = { ...task, status: "failed", error: "导出文件已过期，请重新导出。" };
                    }
                }
                this.tasks.set(task.id, task);
            }
        })();
    }
    async persist(task) {
        // A unique temp name: `cancel` and the in-flight `run` may both persist the
        // same task concurrently, and a shared `.tmp` name would let one writer's
        // rename consume the other's temp file (ENOENT).
        const temporary = resolve(this.root, `${task.id}.${randomUUID()}.json.tmp`);
        await writeFile(temporary, JSON.stringify({ ...task, outputPath: undefined }), "utf8");
        await rename(temporary, resolve(this.root, `${task.id}.json`));
    }
    async start(options, filename) {
        await this.initialize();
        await this.pruneExpiredTasks();
        const now = this.timestamp(), id = randomUUID();
        const active = [...this.tasks.values()].filter((task) => task.status === "queued" || task.status === "running").length;
        if (active >= 8)
            throw new Error("后台证据包导出任务较多，请稍后重试。");
        const task = { id, status: "queued", projectId: options.projectId, filename, createdAt: now, updatedAt: now };
        this.tasks.set(id, task);
        await this.persist(task);
        const work = this.queue.then(() => this.run(task, structuredClone(options)));
        this.queue = work.catch(() => undefined);
        return this.publicTask(task);
    }
    async run(task, options) {
        // Read through a helper: assigning `status` narrows the property's type
        // inside this method, which would make later "canceled" checks a
        // no-overlap comparison (TS2367). Cancellation is written by `cancel()`
        // from another tick, so the narrowed type is simply wrong here.
        const canceled = () => task.status === "canceled";
        const stopCanceled = () => { task.updatedAt = this.timestamp(); };
        let outputPath;
        try {
            // A queued task cancelled before it reached the head of the queue must
            // not spend work on packaging: it was already answered "canceled".
            if (canceled())
                return;
            task.status = "running";
            task.updatedAt = this.timestamp();
            await this.persist(task);
            const revisionStarted = performance.now();
            const before = options.observedRevision ?? await this.currentRevision(options.projectId, options.sessionId);
            apiLog.info("research-package.stage", { projectId: options.projectId, sessionId: options.sessionId, level: options.level,
                mode: "export-task", phase: "preflight", ms: Math.round((performance.now() - revisionStarted) * 10) / 10,
                reusedObservedRevision: options.observedRevision !== undefined });
            if (canceled()) {
                stopCanceled();
                return;
            }
            if (before !== options.revision)
                throw new Error("会话内容已更新，请使用最新大小预览重新导出。");
            // Stream straight into the task's own file: the archive is never held in memory,
            // so a cancellation drops a partial file instead of discarding a buffer.
            outputPath = resolve(this.root, `${task.id}.sdresearch`);
            const destination = createWriteStream(outputPath, { flags: "wx" });
            const writeStarted = performance.now();
            let writeOk = false;
            try {
                await this.createPackage(options, destination);
                writeOk = true;
            }
            finally {
                apiLog.info("research-package.stage", { projectId: options.projectId, sessionId: options.sessionId, level: options.level,
                    mode: "export-task", phase: "write", ms: Math.round((performance.now() - writeStarted) * 10) / 10,
                    bytes: destination.bytesWritten, ok: writeOk });
            }
            // Cancellation requested while createPackage was running: drop the produced
            // archive instead of persisting it.
            if (canceled()) {
                await rm(outputPath, { force: true });
                stopCanceled();
                return;
            }
            const after = await this.currentRevision(options.projectId, options.sessionId);
            if (canceled()) {
                await rm(outputPath, { force: true });
                stopCanceled();
                return;
            }
            if (after !== options.revision) {
                await rm(outputPath, { force: true });
                throw new Error("导出期间会话内容发生变化，请基于最新内容重新导出。");
            }
            // A cancel can land while the final write is in flight; committing
            // "completed" unconditionally would keep and advertise an archive the
            // user cancelled, so drop it and stay cancelled.
            if (canceled()) {
                await rm(outputPath, { force: true });
                stopCanceled();
                return;
            }
            task.status = "completed";
            task.outputPath = outputPath;
            task.updatedAt = this.timestamp();
        }
        catch (reason) {
            if (outputPath)
                await rm(outputPath, { force: true }).catch(() => undefined);
            // A partial archive is never a download: a streaming writer that failed halfway
            // leaves a truncated file, so drop it before reporting the failure.
            // A user cancellation wins over a packaging failure (the failure may be
            // the direct result of tearing the work down).
            if (canceled()) {
                stopCanceled();
            }
            else {
                task.status = "failed";
                task.error = reason instanceof Error ? reason.message : "证据包导出失败，请重试。";
                task.updatedAt = this.timestamp();
            }
        }
        try {
            await this.persist(task);
        }
        catch { /* Task result remains available for this process. */ }
    }
    /** Cancel a queued/running export; a terminal task is returned unchanged. */
    async cancel(id, projectId) {
        await this.initialize();
        await this.pruneExpiredTasks();
        const task = this.tasks.get(id);
        if (!task || task.projectId !== projectId)
            return undefined;
        if (task.status === "queued" || task.status === "running") {
            task.status = "canceled";
            task.updatedAt = this.timestamp();
            await this.persist(task);
        }
        return this.publicTask(task);
    }
    async get(id, projectId) {
        await this.initialize();
        await this.pruneExpiredTasks();
        const task = this.tasks.get(id);
        return task?.projectId === projectId ? this.publicTask(task) : undefined;
    }
    async download(id, projectId) {
        await this.initialize();
        await this.pruneExpiredTasks();
        const task = this.tasks.get(id);
        if (!task || task.projectId !== projectId || task.status !== "completed" || !task.outputPath)
            return undefined;
        return { path: task.outputPath, filename: task.filename };
    }
    async close() { await this.queue; }
    publicTask(task) {
        const { id, status, filename, createdAt, updatedAt, error } = task;
        return { id, status, filename, createdAt, updatedAt, ...(error ? { error } : {}) };
    }
}
