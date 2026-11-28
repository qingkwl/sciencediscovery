import type { McpTransportClient } from "@sciencediscovery/data-source";
/** No servers, and invoking fails closed so an accidental dependency is loud. */
export declare const offlineMcpTransport: McpTransportClient;
