/**
 * Proof that a request for this machine's control-plane token came from a real
 * HUAWEI sign-in.
 *
 * The account service is the only authority that can tell a live access token
 * from a made-up one, so the loopback bootstrap route asks it. Nothing about a
 * `Bearer <anything>` header is trusted on its own.
 */
export interface AccountVerificationOptions {
    /** Base URL of the account service; empty means verification is unavailable. */
    baseUrl: string;
    fetchImpl?: typeof fetch;
    /** Bound on the round trip so a wedged account service cannot park the route. */
    timeoutMs?: number;
}
export type AccountVerification = {
    ok: true;
} | {
    ok: false;
    reason: "not_configured" | "unauthorized" | "unreachable";
};
export declare function verifyAccountAccessToken(authorization: string | undefined, options: AccountVerificationOptions): Promise<AccountVerification>;
/** The Host header must name this machine: a browser page reaching the loopback
 *  port through DNS rebinding carries its own hostname, not `127.0.0.1`. */
export declare function isLoopbackHost(host: string | undefined): boolean;
