import type { RemoteHostEndpoint, RemoteHostTarget } from "@sciencediscovery/schema";
/** The secrets a remote machine can have, each stored under its own row. */
export type RemoteHostSecretKind = "passphrase" | "password" | "privateKey" | "token";
/**
 * The SSH port a machine was registered with. `null`/absent means the user left
 * it blank, which is how they ask for the destination to be resolved by their
 * SSH configuration instead.
 */
export declare function normalizeSshPort(value: number | null | undefined): number | undefined;
/**
 * Where a self-deployed runner listens. Only an address and a port are
 * accepted: a full URL would let a path or credentials ride along into every
 * later request, and the runner's HTTP contract is rooted at `/`.
 */
export declare function normalizeRemoteHostEndpoint(input: Partial<RemoteHostEndpoint> | undefined): RemoteHostEndpoint;
/**
 * Why this machine cannot be a Session's execution target, or `undefined` when
 * it can. An SSH machine qualifies when it already carries the runner or can
 * receive the deployed one; a self-deployed runner qualifies when the product
 * knows where it listens and holds its token.
 */
export declare function remoteRunnerUnusableReason(host: RemoteHostTarget): string | undefined;
/**
 * Bring a persisted host up to the current shape. Hosts registered before the
 * product could connect to a self-deployed runner carry no connection kind and
 * are SSH targets by definition.
 */
export declare function normalizePersistedRemoteHost(saved: RemoteHostTarget): RemoteHostTarget;
/**
 * A persisted Session's allowed remote machines. Sessions saved under the
 * earlier model carried one `remoteRunnerHostId` that pinned every execution to
 * that machine; the machine stays allowed, but the Session is no longer locked
 * out of local execution.
 */
export declare function normalizePersistedSessionRemoteRunners(saved: {
    runnerIds?: unknown;
    remoteRunnerHostId?: unknown;
    remoteRunnerHostIds?: unknown;
}): {
    runnerIds?: string[];
    remoteRunnerHostIds?: string[];
};
