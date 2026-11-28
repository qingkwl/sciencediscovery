export class SpecialistRuntimeConfigError extends Error {
    code = "SPECIALIST_RUNTIME_INVALID";
}
/** Fail closed: metadata is never an argv, environment or credential channel. */
export function normalizeSpecialistRuntime(value) {
    if (value === undefined)
        return undefined;
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new SpecialistRuntimeConfigError("Invalid Specialist runtime");
    const runtime = value;
    if (!["native", "codex", "claude-code", "acp"].includes(runtime.kind))
        throw new SpecialistRuntimeConfigError("Unsupported Specialist runtime");
    const allowed = runtime.kind !== "native" ? ["kind", "model", "fallback", "timeoutSeconds", "reasoningEffort", "execution"] : ["kind"];
    if (Object.keys(runtime).some(key => !allowed.includes(key)))
        throw new SpecialistRuntimeConfigError("Unknown runtime option; use the secret channel for credentials");
    if (runtime.kind === "native")
        return { kind: "native" };
    if (runtime.model !== undefined && (typeof runtime.model !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(runtime.model))) {
        throw new SpecialistRuntimeConfigError("Invalid Codex model ID");
    }
    if (runtime.execution !== undefined && !["sandbox", "direct"].includes(runtime.execution))
        throw new SpecialistRuntimeConfigError("Invalid execution mode");
    if (runtime.fallback !== undefined && typeof runtime.fallback !== "boolean")
        throw new SpecialistRuntimeConfigError("Invalid fallback option");
    if (runtime.timeoutSeconds !== undefined && (!Number.isSafeInteger(runtime.timeoutSeconds) || runtime.timeoutSeconds < 1 || runtime.timeoutSeconds > 86400))
        throw new SpecialistRuntimeConfigError("Invalid runtime timeout (1-86400 seconds)");
    if (runtime.reasoningEffort !== undefined && !["minimal", "low", "medium", "high", "xhigh"].includes(runtime.reasoningEffort))
        throw new SpecialistRuntimeConfigError("Invalid reasoning effort");
    return { kind: runtime.kind, ...(runtime.execution ? { execution: runtime.execution } : {}), ...("fallback" in runtime ? { fallback: runtime.fallback } : {}),
        ...("timeoutSeconds" in runtime ? { timeoutSeconds: runtime.timeoutSeconds } : {}),
        ...("reasoningEffort" in runtime ? { reasoningEffort: runtime.reasoningEffort } : {}), ...(runtime.model ? { model: runtime.model } : {}) };
}
