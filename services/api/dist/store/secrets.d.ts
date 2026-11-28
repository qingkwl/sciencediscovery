import type { SecretProtector } from "../platform/os/types.js";
import type { CreateModelProfileRequest, ModelFactOverrides, ModelProfile, UpdateModelProfileRequest } from "@sciencediscovery/schema";
export declare function normalizeModelFactOverrides(value: unknown): ModelFactOverrides | undefined;
export declare function validateLiveModel(input: CreateModelProfileRequest | UpdateModelProfileRequest): Omit<ModelProfile, "createdAt" | "hasApiToken" | "id" | "proxyPolicy" | "updatedAt">;
export declare function normalizeApiToken(value: string | null | undefined): string | undefined;
/**
 * Load the model-secret master key, creating it on first start.
 *
 * At-rest format follows the platform's protector: POSIX keeps the raw 32
 * bytes behind 0600; Windows stores a DPAPI blob (CurrentUser scope). A
 * legacy raw-key file on a wrapping platform is upgraded in place — racing
 * writers wrap the same bytes, so last-write-wins is lossless. A blob that
 * fails to unwrap (copied from another account/machine) is an error, never a
 * silent regeneration: the old ciphertext would become undecryptable.
 */
export declare function loadOrCreateModelSecretKey(path: string, protector?: SecretProtector): Promise<Buffer>;
export declare function modelSecretKey(path: string, protector?: SecretProtector): Promise<Buffer>;
/** Kick off the key resolution early (server entry); callers still await
 * `modelSecretKey()` — this only warms the memo. Safe to call repeatedly. */
export declare function warmModelSecretKey(path: string, protector?: SecretProtector): void;
/**
 * Encrypt one stored credential. `context` names what the value belongs to and
 * is authenticated with it, so a row copied between tables or between ids fails
 * to decrypt rather than silently authenticating as something else.
 */
export declare function encryptSecretValue(secretKey: Buffer, context: string, value: string): string;
export declare function decryptSecretValue(secretKey: Buffer, context: string, encrypted: string): string;
export declare function encryptModelApiToken(secretKey: Buffer, modelId: string, apiToken: string): string;
export declare function decryptModelApiToken(secretKey: Buffer, modelId: string, encrypted: string): string;
