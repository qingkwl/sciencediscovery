/** Where the token came from, so startup output can be honest about it. */
export type BootstrapTokenSource = "environment" | "generated" | "stored";
export interface ResolvedBootstrapToken {
    source: BootstrapTokenSource;
    token: string;
}
/** Directory under the data dir that holds the generated credentials. */
export declare const BOOTSTRAP_SECRETS_DIRECTORY = "secrets";
/** Browser-to-control-plane bearer token (`SCIENCE_AGENT_AUTH_TOKEN`). */
export declare const AUTH_TOKEN_FILE = "auth-token";
export declare function bootstrapTokenPath(dataDir: string, fileName: string): string;
/**
 * Resolve one credential: an explicit operator value wins, then a previously
 * generated one, and only a first-ever start generates and persists a new token.
 */
export declare function resolveBootstrapToken(dataDir: string, fileName: string, explicit?: string): ResolvedBootstrapToken;
/** Startup credentials; the URL fragment is consumed only by the browser. */
export declare function accessTokenBanner(config: {
    authToken: string;
    authTokenSource?: BootstrapTokenSource;
    dataDir: string;
    host: string;
    port: number;
}): string[];
