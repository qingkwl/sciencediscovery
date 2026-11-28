export declare class CandidateSources {
    private readonly root;
    constructor(dataDir: string, override?: string);
    read(runId: string, hash: string): Promise<string | undefined>;
    /** All candidate sources still retained for one run. Package export uses this
     *  instead of guessing hashes from an event log, which can outlive pruning. */
    list(runId: string): Promise<Array<{
        hash: string;
        source: string;
    }>>;
    /** Restore a package's candidate source without allowing package paths to
     *  escape the sidecar-owned candidate directory. */
    write(runId: string, hash: string, source: string): Promise<boolean>;
}
