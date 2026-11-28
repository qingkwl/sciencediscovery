import { type IdeaTreeSettings, type IdeaTreeSettingsOverride, type McpProxyPolicies, type MemoryGraphSettings, type ProxyDefaultPolicy, type ProxyPolicy, type ProxyServerKind, type RuntimeSettingsOverrides, type SystemQuotaSettings, type SystemTimeoutSettings, type UpdateIdeaTreeSettingsRequest, type WebSettings } from "@sciencediscovery/schema";
export declare function knownConnectorIdSet(): ReadonlySet<string>;
export declare const RUNTIME_SETTINGS_FIELDS: readonly ["defaultApprovalMode", "plugins", "enabledConnectorIds", "enabledSkillLibraries", "enabledSkillIds", "ideaTreeOverride", "modelId", "reviewModelId", "reviewThinkingEffort", "semanticReviewEnabled", "skillSelectionMode", "thinkingEffort", "thinkingMode"];
/** Global defaults no longer configure skills; strip the fields instead of merging them. */
export declare function withoutSkillSelection(overrides: RuntimeSettingsOverrides): RuntimeSettingsOverrides;
export declare function normalizeRuntimeSettings(value: unknown, modelIds: ReadonlySet<string>, skillIds: ReadonlySet<string>, strict: boolean, connectorIds?: ReadonlySet<string>): RuntimeSettingsOverrides;
/** The Idea Tree override belongs to a Session alone: the catalog declares
 *  `["system", "session"]`, and a Global or Project value would silently become
 *  every Session's research parameters. Those layers drop it on write. */
export declare function withoutIdeaTreeOverride(overrides: RuntimeSettingsOverrides): RuntimeSettingsOverrides;
export declare function normalizeIdeaTreeOverride(value: unknown, strict: boolean): IdeaTreeSettingsOverride | undefined;
export declare function normalizeTimeoutSettings(value: unknown): SystemTimeoutSettings;
export declare function normalizeQuotaSettings(value: unknown): SystemQuotaSettings;
/** Fill missing quota fields from fallback (catalog migration / partial PUT). */
export declare function resolveQuotaSettings(value: unknown, fallback: SystemQuotaSettings): SystemQuotaSettings;
/** Normalize persisted/partial memory-graph settings, filling gaps from the
 *  product defaults. Unknown keys are dropped silently (not rejected) so an
 *  older catalog row carrying a renamed field — e.g. the pre-HTTP `neo4jBolt`
 *  key left over from when the sidecar spoke Bolt — does not wedge boot; the
 *  stale value is simply ignored and the current field falls back to its
 *  default until the user re-configures it in System Settings. Malformed
 *  known values still throw. A missing field falls back to the default so a
 *  partial PUT or an older catalog row still yields a valid settings object. */
export declare function normalizeMemoryGraphSettings(value: unknown): MemoryGraphSettings;
export declare function normalizeWebSettings(value: unknown): WebSettings;
export declare function normalizeProxyUrl(value: string): string;
export declare const PROXY_SERVER_KINDS: Set<ProxyServerKind>;
export declare function normalizeProxyPolicy(value: unknown, field: string): ProxyPolicy;
export declare function normalizeProxyDefaultPolicy(value: unknown): ProxyDefaultPolicy;
/** Normalize the per-MCP-server proxy policy map. Explicit "inherit" entries
 *  are dropped — inherit is the implicit default for unlisted servers. */
export declare function normalizeMcpProxyPolicies(value: unknown): McpProxyPolicies;
/**
 * Per-Runner NPU selections read back from disk. A malformed entry is dropped
 * rather than repaired: a bad card index would otherwise travel all the way to
 * a sandbox launch, and an empty selection is the safe reading of "unknown".
 */
export declare function normalizeNpuDeviceSelections(value: unknown): Record<string, number[]>;
/**
 * Normalize an Idea Tree settings update against the current stored value.
 *
 * - Empty strings become undefined so the product defaults (or the workflow
 *   skill's built-in values) are used.
 * - Numeric fields are range-validated and omitted fields retain the current
 *   value. Template and exploration intensity own research budgets and
 *   assessor definitions, so callers cannot configure them here.
 * - `roleThinkingEfforts` is no longer a setting: every stage follows the
 *   research model's own thinking level. A payload that still carries it is
 *   ignored, and a stored map is dropped on load, so the old per-stage
 *   overrides stop applying without failing anyone's save.
 */
export declare function normalizeIdeaTreeSettings(input: UpdateIdeaTreeSettingsRequest, current: IdeaTreeSettings): IdeaTreeSettings;
/** Fill missing Idea Tree settings fields from the product defaults. Used on
 *  catalog load and on partial GETs so the runtime always sees a complete
 *  settings object. Unknown keys are dropped silently (same rule as the
 *  memory-graph normalizer) so a stale catalog row carrying a renamed field
 *  does not wedge boot. */
export declare function resolveIdeaTreeSettings(value: unknown): IdeaTreeSettings;
