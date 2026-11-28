import type { OsAdaptation, SecretProtector } from "./types.js";
/** The current user's SID ("S-1-..."), via `whoami /user`.
 *
 * Granting by account NAME breaks on non-ASCII (e.g. Chinese)
 * usernames — whoami writes console output in the OEM codepage (GBK on
 * zh-CN), Node decodes it as UTF-8, and the mangled "computer\????" grant
 * then fails account-name→SID mapping with icacls error 1332, which took
 * the control API down during first-run startup on a field machine
 * (2026-10-19, desktop-o18d7mc). The SID is pure ASCII in every locale and
 * icacls accepts it with a leading "*", so grants are SID-based now. The
 * account name in the output may still arrive mojibake'd; the regex never
 * looks at it. */
export declare function currentUserSid(): string;
export declare const win32SecretProtector: SecretProtector;
export declare const win32Adaptation: OsAdaptation;
