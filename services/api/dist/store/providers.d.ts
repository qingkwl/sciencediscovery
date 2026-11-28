import type { CreateModelProviderRequest, ModelProfile, ModelProvider, UpdateModelProviderRequest } from "@sciencediscovery/schema";
/** Provider tokens share the encrypted model-secret table under a reserved
 *  key prefix; profile ids are UUIDs so the namespaces cannot collide. */
export declare function providerSecretKey(providerId: string): string;
/**
 * Normalize a create/update payload into the persisted provider fields.
 * Preset-derived providers start from the preset's endpoint facts; every
 * field stays overridable so self-hosted gateways and stubs keep working.
 */
export declare function validateLiveProvider(input: CreateModelProviderRequest | (UpdateModelProviderRequest & {
    presetId?: ModelProvider["presetId"];
})): Omit<ModelProvider, "createdAt" | "hasApiToken" | "id" | "proxyPolicy" | "tokenOptional" | "updatedAt">;
/**
 * Compare two endpoints the way a provider would: same scheme, host, port and
 * path. Query, fragment and a trailing slash are display noise, and an
 * unparseable value is compared as the trimmed literal so a hand-edited
 * catalog still groups with itself.
 */
export declare function canonicalProviderBaseUrl(value: string): string;
/**
 * The connection identity of a standalone profile. Protocol, dialect and
 * endpoint are exactly the three facts a `ModelProvider` owns, so two profiles
 * belong to the same migrated provider only when all three agree. Differences
 * that live on the profile — model id, thinking defaults, vision — never split
 * a group.
 */
export declare function standaloneProfileGroupKey(profile: Pick<ModelProfile, "apiProtocol" | "apiVariant" | "baseUrl">): string;
export interface StandaloneProfileMigration {
    /** Profile id to the provider it now belongs to. */
    assignments: Map<string, string>;
    /** Providers to append, in first-seen order. */
    providers: ModelProvider[];
}
export interface StandaloneProfileMigrationOptions {
    newProviderId: () => string;
    now: string;
}
/**
 * Plan the one-time move of legacy standalone profiles into custom providers.
 *
 * Profiles predating the provider registry carry their own connection fields.
 * Grouping them by connection turns each distinct endpoint into one provider
 * and leaves every profile id, endpoint, dialect and thinking default exactly
 * as it was: the only field that changes on a profile is `providerId`.
 *
 * Credentials are deliberately left alone. Copying a group's shared token up
 * to the provider would look harmless, but it changes what "remove saved
 * token" does on those profiles: the model would keep authenticating through
 * the provider copy after the user believed the key was gone. A migrated
 * provider therefore starts with no token, and each profile keeps resolving
 * its own, exactly as before.
 *
 * The plan is pure so the store can apply it inside its existing load
 * sequence, and so the grouping is testable without a database. It is
 * idempotent by construction: once a profile has a `providerId` it is no
 * longer standalone and later loads plan nothing.
 */
export declare function planStandaloneProfileMigration(models: readonly ModelProfile[], options: StandaloneProfileMigrationOptions): StandaloneProfileMigration;
