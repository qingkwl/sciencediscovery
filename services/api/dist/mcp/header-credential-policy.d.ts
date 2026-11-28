/** Validate a credential header name while excluding transport-owned fields. */
export declare function isMcpCredentialHeader(name: string): boolean;
export declare function isMcpHeaderCredentialValue(secret: unknown): secret is string;
