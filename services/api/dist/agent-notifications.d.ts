import type { DatabaseSync } from "node:sqlite";
import type { ExecutionOwner } from "@sciencediscovery/schema";
export interface AgentNotification extends ExecutionOwner {
    id: string;
    kind: "execution" | "timer";
    sourceId: string;
    message: string;
    createdAt: number;
    readAt?: number;
}
export interface AgentTimer extends ExecutionOwner {
    id: string;
    dueAt: number;
    message: string;
    executionId?: string;
    state: "pending" | "fired" | "cancelled";
}
export interface NotificationBatch extends ExecutionOwner {
    epoch: number;
    agentEpoch: number;
    notifications: AgentNotification[];
}
/** A durable inbox, not a command queue. Delivery never stores or replays executable code. */
export declare class AgentNotifications {
    private readonly db;
    private readonly archived;
    private readonly clock;
    constructor(db: DatabaseSync, archived: (sessionId: string) => boolean, clock?: () => number);
    private transaction;
    private gate;
    canWake(sessionId: string): boolean;
    generation(sessionId: string): number;
    private agentGate;
    canWakeAgent(owner: ExecutionOwner): boolean;
    stopAgent(owner: ExecutionOwner): void;
    /** A user resuming one child is also explicitly resuming this Session's
     * automatic wakeups. A Session Stop closes the global gate, so reopening only
     * the child would leave its retained completion notice undeliverable.
     * Keep both updates in one transaction: a partial resume must never expose a
     * child as runnable while its Session remains stopped. */
    resumeAgent(owner: ExecutionOwner): void;
    /** Stop dominates outstanding delivery batches, including a batch already read by a scheduler. */
    stop(sessionId: string): void;
    /** Only a user-originated resume may call this; restoring an archive is not an implicit resume. */
    resume(sessionId: string, expectedEpoch?: number): boolean;
    deleteSession(sessionId: string): void;
    /** Complete authority records for the existing turn-level State Pool, not a second version store. */
    snapshot(sessionId: string, agentId?: string): unknown;
    unread(owner: ExecutionOwner, limit?: number): AgentNotification[];
    prepareDelivery(owner: ExecutionOwner): NotificationBatch | undefined;
    pendingOwners(): ExecutionOwner[];
    deliveryAllowed(batch: NotificationBatch): boolean;
    pendingDelivery(batch: NotificationBatch): NotificationBatch | undefined;
    /** Acknowledge only after durable context delivery. A failed or interrupted wake retains unread records. */
    acknowledge(batch: NotificationBatch): boolean;
    /** The owner's model has already read this record through a tool result, so
     * the retained notice would only wake it to read the same thing again. Marks
     * one (owner, kind, source) as read; nothing else in the inbox is touched. */
    markRead(owner: ExecutionOwner, kind: AgentNotification["kind"], sourceId: string): boolean;
    /** Withdraw an execution notice whose outcome proved not to be final, so the real end can notify again. */
    reopenExecution(owner: ExecutionOwner, executionId: string): void;
    complete(owner: ExecutionOwner, executionId: string, message: string): void;
    /**
     * Correct the text of a retained notice: the outcome it announced changed.
     * A notice is retained once per (owner, kind, source), so the first message
     * would otherwise keep announcing an outcome that no longer holds.
     */
    revise(owner: ExecutionOwner, kind: AgentNotification["kind"], sourceId: string, message: string): void;
    createTimer(owner: ExecutionOwner, input: {
        dueAt: number;
        message: string;
        executionId?: string;
    }): AgentTimer;
    timers(owner: ExecutionOwner): AgentTimer[];
    cancelTimer(owner: ExecutionOwner, id: string): void;
    /** Polling can restart freely: marking fired and recording the notice are one transaction. */
    poll(): void;
    private validateMessage;
    private insert;
}
