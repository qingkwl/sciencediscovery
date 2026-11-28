// Copyright (C) 2026-2026 Huawei Technologies Co., Ltd
// Licensed under the Apache License, Version 2.0 (the "License");
import { randomUUID } from "node:crypto";
/** A durable inbox, not a command queue. Delivery never stores or replays executable code. */
export class AgentNotifications {
    db;
    archived;
    clock;
    constructor(db, archived, clock = Date.now) {
        this.db = db;
        this.archived = archived;
        this.clock = clock;
        db.exec(`
      CREATE TABLE IF NOT EXISTS agent_wake_gates (
        session TEXT PRIMARY KEY, stopped INTEGER NOT NULL DEFAULT 0, epoch INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS agent_instance_wake_gates (
        session TEXT NOT NULL, agent TEXT NOT NULL, stopped INTEGER NOT NULL DEFAULT 0, epoch INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(session, agent));
      CREATE TABLE IF NOT EXISTS agent_notifications (
        id TEXT PRIMARY KEY, session TEXT NOT NULL, agent TEXT NOT NULL, kind TEXT NOT NULL,
        source TEXT NOT NULL, message TEXT NOT NULL, created INTEGER NOT NULL, read_at INTEGER,
        UNIQUE(session, agent, kind, source));
      CREATE TABLE IF NOT EXISTS agent_timers (
        id TEXT PRIMARY KEY, session TEXT NOT NULL, agent TEXT NOT NULL, due INTEGER NOT NULL,
        message TEXT NOT NULL, execution TEXT, state TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS agent_notifications_unread ON agent_notifications(session, agent, read_at);
      CREATE INDEX IF NOT EXISTS agent_timers_due ON agent_timers(state, due);
    `);
    }
    transaction(operation) {
        this.db.exec("SAVEPOINT notification_change");
        try {
            const value = operation();
            this.db.exec("RELEASE notification_change");
            return value;
        }
        catch (error) {
            this.db.exec("ROLLBACK TO notification_change; RELEASE notification_change");
            throw error;
        }
    }
    gate(sessionId) {
        this.db.prepare("INSERT OR IGNORE INTO agent_wake_gates(session) VALUES (?)").run(sessionId);
        return this.db.prepare("SELECT stopped, epoch FROM agent_wake_gates WHERE session = ?").get(sessionId);
    }
    canWake(sessionId) { return !this.archived(sessionId) && !this.gate(sessionId).stopped; }
    generation(sessionId) { return this.gate(sessionId).epoch; }
    agentGate(owner) {
        this.db.prepare("INSERT OR IGNORE INTO agent_instance_wake_gates(session, agent) VALUES (?, ?)").run(owner.sessionId, owner.agentId);
        return this.db.prepare("SELECT stopped, epoch FROM agent_instance_wake_gates WHERE session = ? AND agent = ?")
            .get(owner.sessionId, owner.agentId);
    }
    canWakeAgent(owner) { return this.canWake(owner.sessionId) && !this.agentGate(owner).stopped; }
    stopAgent(owner) {
        this.transaction(() => {
            this.agentGate(owner);
            this.db.prepare("UPDATE agent_instance_wake_gates SET stopped = 1, epoch = epoch + 1 WHERE session = ? AND agent = ?")
                .run(owner.sessionId, owner.agentId);
            this.db.prepare("UPDATE agent_timers SET state = 'cancelled' WHERE session = ? AND agent = ? AND state = 'pending'")
                .run(owner.sessionId, owner.agentId);
        });
    }
    /** A user resuming one child is also explicitly resuming this Session's
     * automatic wakeups. A Session Stop closes the global gate, so reopening only
     * the child would leave its retained completion notice undeliverable.
     * Keep both updates in one transaction: a partial resume must never expose a
     * child as runnable while its Session remains stopped. */
    resumeAgent(owner) {
        if (this.archived(owner.sessionId))
            throw new Error("Archived Session cannot resume automatic wakeups");
        this.transaction(() => {
            this.gate(owner.sessionId);
            // Do not invalidate another agent's prepared delivery when the Session is already open.
            this.db.prepare("UPDATE agent_wake_gates SET stopped = 0, epoch = epoch + 1 WHERE session = ? AND stopped = 1")
                .run(owner.sessionId);
            this.agentGate(owner);
            this.db.prepare("UPDATE agent_instance_wake_gates SET stopped = 0, epoch = epoch + 1 WHERE session = ? AND agent = ? AND stopped = 1")
                .run(owner.sessionId, owner.agentId);
        });
    }
    /** Stop dominates outstanding delivery batches, including a batch already read by a scheduler. */
    stop(sessionId) {
        this.transaction(() => {
            this.gate(sessionId);
            this.db.prepare("UPDATE agent_wake_gates SET stopped = 1, epoch = epoch + 1 WHERE session = ?").run(sessionId);
            this.db.prepare("UPDATE agent_timers SET state = 'cancelled' WHERE session = ? AND state = 'pending'").run(sessionId);
        });
    }
    /** Only a user-originated resume may call this; restoring an archive is not an implicit resume. */
    resume(sessionId, expectedEpoch) {
        if (this.archived(sessionId))
            throw new Error("Archived Session cannot resume automatic wakeups");
        if (expectedEpoch !== undefined && this.gate(sessionId).epoch !== expectedEpoch)
            return false;
        this.gate(sessionId);
        this.db.prepare("UPDATE agent_wake_gates SET stopped = 0, epoch = epoch + 1 WHERE session = ?").run(sessionId);
        return true;
    }
    deleteSession(sessionId) {
        this.transaction(() => {
            for (const table of ["agent_timers", "agent_notifications", "agent_instance_wake_gates", "agent_wake_gates"]) {
                this.db.prepare(`DELETE FROM ${table} WHERE session = ?`).run(sessionId);
            }
        });
    }
    /** Complete authority records for the existing turn-level State Pool, not a second version store. */
    snapshot(sessionId, agentId) {
        const where = agentId === undefined ? "session = ?" : "session = ? AND agent = ?";
        const args = agentId === undefined ? [sessionId] : [sessionId, agentId];
        return {
            gate: this.gate(sessionId),
            agents: this.db.prepare(`SELECT agent, stopped, epoch FROM agent_instance_wake_gates WHERE ${where} ORDER BY agent`).all(...args),
            notifications: this.db.prepare(`SELECT * FROM agent_notifications WHERE ${where} ORDER BY created, id`).all(...args),
            timers: this.db.prepare(`SELECT * FROM agent_timers WHERE ${where} ORDER BY due, id`).all(...args),
        };
    }
    unread(owner, limit = 100) {
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
            throw new Error("Notification page must contain 1-100 entries");
        return this.db.prepare(`SELECT * FROM agent_notifications WHERE session = ? AND agent = ? AND read_at IS NULL
      ORDER BY created, id LIMIT ?`).all(owner.sessionId, owner.agentId, limit).map((row) => ({
            id: String(row.id), sessionId: String(row.session), agentId: String(row.agent),
            kind: row.kind, sourceId: String(row.source), message: String(row.message), createdAt: Number(row.created),
        }));
    }
    prepareDelivery(owner) {
        if (!this.canWakeAgent(owner))
            return undefined;
        const notifications = this.unread(owner);
        return notifications.length ? { ...owner, epoch: this.gate(owner.sessionId).epoch, agentEpoch: this.agentGate(owner).epoch, notifications } : undefined;
    }
    pendingOwners() {
        return this.db.prepare("SELECT DISTINCT session, agent FROM agent_notifications WHERE read_at IS NULL")
            .all().map((row) => ({ sessionId: String(row.session), agentId: String(row.agent) }));
    }
    deliveryAllowed(batch) {
        return this.canWakeAgent(batch) && this.gate(batch.sessionId).epoch === batch.epoch && this.agentGate(batch).epoch === batch.agentEpoch;
    }
    pendingDelivery(batch) {
        if (!this.deliveryAllowed(batch))
            return undefined;
        const unread = new Set(this.unread(batch).map((notice) => notice.id));
        const notifications = batch.notifications.filter((notice) => unread.has(notice.id));
        return notifications.length ? { ...batch, notifications } : undefined;
    }
    /** Acknowledge only after durable context delivery. A failed or interrupted wake retains unread records. */
    acknowledge(batch) {
        return this.transaction(() => {
            if (!this.deliveryAllowed(batch))
                return false;
            const mark = this.db.prepare("UPDATE agent_notifications SET read_at = ? WHERE id = ? AND session = ? AND agent = ? AND read_at IS NULL");
            for (const notice of batch.notifications)
                mark.run(this.clock(), notice.id, batch.sessionId, batch.agentId);
            return true;
        });
    }
    /** The owner's model has already read this record through a tool result, so
     * the retained notice would only wake it to read the same thing again. Marks
     * one (owner, kind, source) as read; nothing else in the inbox is touched. */
    markRead(owner, kind, sourceId) {
        return this.db.prepare("UPDATE agent_notifications SET read_at = ? WHERE session = ? AND agent = ? AND kind = ? AND source = ? AND read_at IS NULL")
            .run(this.clock(), owner.sessionId, owner.agentId, kind, sourceId).changes > 0;
    }
    /** Withdraw an execution notice whose outcome proved not to be final, so the real end can notify again. */
    reopenExecution(owner, executionId) {
        this.db.prepare("DELETE FROM agent_notifications WHERE session = ? AND agent = ? AND kind = 'execution' AND source = ?")
            .run(owner.sessionId, owner.agentId, executionId);
    }
    complete(owner, executionId, message) {
        this.transaction(() => {
            this.insert(owner, "execution", executionId, message);
            // A completion supersedes a reminder for the same execution, not unrelated timers.
            this.db.prepare("UPDATE agent_timers SET state = 'cancelled' WHERE session = ? AND agent = ? AND execution = ? AND state = 'pending'")
                .run(owner.sessionId, owner.agentId, executionId);
        });
    }
    /**
     * Correct the text of a retained notice: the outcome it announced changed.
     * A notice is retained once per (owner, kind, source), so the first message
     * would otherwise keep announcing an outcome that no longer holds.
     */
    revise(owner, kind, sourceId, message) {
        this.db.prepare("UPDATE agent_notifications SET message = ? WHERE session = ? AND agent = ? AND kind = ? AND source = ?")
            .run(this.validateMessage(message), owner.sessionId, owner.agentId, kind, sourceId);
    }
    createTimer(owner, input) {
        if (!this.canWakeAgent(owner))
            throw new Error("Agent is stopped or Session is archived; resume before creating a timer");
        if (!Number.isSafeInteger(input.dueAt) || input.dueAt <= this.clock())
            throw new Error("Timer must specify a future timestamp");
        const message = this.validateMessage(input.message);
        if (input.executionId && this.db.prepare("SELECT id FROM agent_notifications WHERE session = ? AND agent = ? AND kind = 'execution' AND source = ?")
            .get(owner.sessionId, owner.agentId, input.executionId))
            throw new Error("Execution already completed; inspect its result instead of setting a reminder");
        const timer = { sessionId: owner.sessionId, agentId: owner.agentId, id: randomUUID(),
            dueAt: input.dueAt, ...(input.executionId ? { executionId: input.executionId } : {}), message, state: "pending" };
        this.db.prepare("INSERT INTO agent_timers VALUES (?, ?, ?, ?, ?, ?, ?)")
            .run(timer.id, owner.sessionId, owner.agentId, timer.dueAt, timer.message, timer.executionId ?? null, timer.state);
        return timer;
    }
    timers(owner) {
        return this.db.prepare("SELECT * FROM agent_timers WHERE session = ? AND agent = ? ORDER BY due, id")
            .all(owner.sessionId, owner.agentId).map((row) => ({
            id: String(row.id), ...owner, dueAt: Number(row.due), message: String(row.message),
            ...(row.execution ? { executionId: String(row.execution) } : {}), state: row.state,
        }));
    }
    cancelTimer(owner, id) {
        if (!this.db.prepare("SELECT id FROM agent_timers WHERE id = ? AND session = ? AND agent = ?").get(id, owner.sessionId, owner.agentId)) {
            throw new Error("Timer not found for this Agent");
        }
        this.db.prepare("UPDATE agent_timers SET state = 'cancelled' WHERE id = ? AND state = 'pending'").run(id);
    }
    /** Polling can restart freely: marking fired and recording the notice are one transaction. */
    poll() {
        this.transaction(() => {
            for (const row of this.db.prepare("SELECT * FROM agent_timers WHERE state = 'pending' AND due <= ?").all(this.clock())) {
                const owner = { sessionId: String(row.session), agentId: String(row.agent) };
                const canWake = this.canWakeAgent(owner);
                if (canWake)
                    this.insert(owner, "timer", String(row.id), String(row.message));
                this.db.prepare("UPDATE agent_timers SET state = ? WHERE id = ?").run(canWake ? "fired" : "cancelled", row.id);
            }
        });
    }
    validateMessage(message) {
        if (typeof message !== "string" || !message.trim() || message.length > 4_000)
            throw new Error("Notification message must contain 1-4000 characters");
        return message;
    }
    insert(owner, kind, source, message) {
        this.db.prepare("INSERT OR IGNORE INTO agent_notifications(id, session, agent, kind, source, message, created) VALUES (?, ?, ?, ?, ?, ?, ?)")
            .run(randomUUID(), owner.sessionId, owner.agentId, kind, source, this.validateMessage(message), this.clock());
    }
}
