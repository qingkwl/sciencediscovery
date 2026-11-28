import type { OsAdaptation, SecretProtector } from "./types.js";
/**
 * No wrapping on POSIX: the 0600 file permission is the at-rest protection,
 * so raw bytes are stored and read back unchanged.
 */
export declare const identitySecretProtector: SecretProtector;
export declare const posixAdaptation: OsAdaptation;
