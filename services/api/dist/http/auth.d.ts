import type { IncomingMessage } from "node:http";
export declare function isAuthorized(request: IncomingMessage, expectedToken: string): boolean;
