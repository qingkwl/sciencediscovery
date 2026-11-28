import { invalid } from "./validation.js";
/** Accept only a policy the preview would offer: inherit, none, or a registered proxy. */
export function previewedProxyPolicy(value, servers) {
    if (value === "inherit" || value === "none")
        return value;
    if (typeof value === "string" && value.startsWith("proxy:")) {
        const serverId = value.slice("proxy:".length);
        if (serverId.length > 0 && serverId.length <= 200 && servers.some(server => server.id === serverId)) {
            return `proxy:${serverId}`;
        }
    }
    invalid("Choose inherit, none or an existing registered proxy", "proxyPolicy");
}
