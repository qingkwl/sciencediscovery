/**
 * A run's two deadlines, as the run bounds them: the whole turn (`runTimeoutMs`) and the longest stretch without
 * progress (`runIdleTimeoutMs`). Both stand still while the run waits on something outside it (an approval),
 * and each says which one ended the run, in the words the run's timeout notice reads.
 */
export declare class RunDeadlines {
    private readonly turnMs;
    private readonly idleMs;
    private readonly onExpired;
    private kind?;
    private turnTimer?;
    private idleTimer?;
    private remainingTurnMs;
    private activeSince;
    private waits;
    private stopped;
    constructor(turnMs: number, idleMs: number, onExpired: () => void);
    start(): void;
    /** Something happened: the idle deadline starts again. */
    progress(): void;
    /** The run waits on something outside it; both deadlines stand still until the returned release is called. */
    beginWait(): () => void;
    /** Which deadline ended the run, if one did. */
    get expired(): "idle" | "turn" | undefined;
    error(): Error;
    stop(): void;
    private armTurn;
    private pause;
    private expire;
}
