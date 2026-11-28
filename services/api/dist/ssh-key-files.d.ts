import type { SshKeyFileListing } from "@sciencediscovery/schema";
/** User-initiated, authenticated host browsing; never open file contents. */
export declare function listSshKeyFiles(path?: string, offset?: number, home?: string): Promise<SshKeyFileListing>;
