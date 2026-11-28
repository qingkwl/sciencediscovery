import type { DatabaseSync } from "node:sqlite";
export interface ConfigurationCredentialBinding {
    sessionId: string;
    requestId: string;
    revision: number;
    target: string;
    fieldId: string;
    /** Trusted adapter policy; never supplied by the credential HTTP payload. */
    normalization?: "trim" | "exact";
}
/** Isolated encrypted drafts. Formal credentials remain in the existing model store. */
export declare class ConfigurationCredentialBridge {
    private readonly database;
    private readonly cipher;
    private readonly now;
    constructor(database: DatabaseSync, cipher: {
        encrypt(id: string, secret: string): string;
        decrypt(id: string, ciphertext: string): string;
    }, now?: () => number);
    private transaction;
    private binding;
    provide(binding: ConfigurationCredentialBinding, secret: unknown, key?: string): {
        handle: string;
        expiresAt: string;
    };
    private row;
    read(handle: string, binding: ConfigurationCredentialBinding): string;
    /** A revision may move forward only for the exact same endpoint and field. */
    rebind(handle: string, binding: ConfigurationCredentialBinding, revision: number): void;
    hasDraft(requestId: string, revision: number, target: string): boolean;
    withLease<T>(handle: string, binding: ConfigurationCredentialBinding, action: (secret: string) => Promise<T>): Promise<T>;
    clearRequest(requestId: string): void;
    /** Discard only the stale implicit draft; a concurrently uploaded replacement
     * for this request must remain usable through its explicit handle. */
    clearDraft(handle: string, binding: ConfigurationCredentialBinding): void;
    clearSession(sessionId: string): void;
    sweep(): void;
}
