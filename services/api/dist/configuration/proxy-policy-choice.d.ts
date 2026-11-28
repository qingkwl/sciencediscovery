import type { ProxyPolicy } from "@sciencediscovery/schema";
/** Accept only a policy the preview would offer: inherit, none, or a registered proxy. */
export declare function previewedProxyPolicy(value: unknown, servers: readonly {
    id: string;
}[]): ProxyPolicy;
