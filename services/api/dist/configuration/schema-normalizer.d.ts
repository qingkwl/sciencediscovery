import type { ConfigurationFieldView, ConfigurationValues } from "@sciencediscovery/schema";
export interface ConfigurationSchemaPolicy {
    /** Exact registered static hosts. Never provided by a model or a form submission. */
    helpHosts?: readonly string[];
    credentialFields?: readonly string[];
}
/** Normalize the supported WorkSwarm text/password contract; unsupported types fail closed. */
export declare function normalizeTokenSchema(source: unknown, policy?: ConfigurationSchemaPolicy): ConfigurationFieldView[];
/** Whitelist projection also validates server adapters; credential fields cannot acquire a value. */
export declare function normalizeConfigurationFields(source: unknown, policy?: ConfigurationSchemaPolicy): ConfigurationFieldView[];
export declare function normalizeConfigurationValues(input: unknown, fields: ConfigurationFieldView[]): ConfigurationValues;
