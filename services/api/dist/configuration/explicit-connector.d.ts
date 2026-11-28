interface ConnectorName {
    id: string;
    name: string;
}
/** Only an unambiguous, standalone request is handled without a model run. */
export declare function explicitConnectorEnableTarget(content: string, connectors: readonly ConnectorName[]): ConnectorName | undefined;
export {};
