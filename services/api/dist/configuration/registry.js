import { ConfigurationError, integer, invalid } from "./validation.js";
import { CONFIGURATION_AGENT_DESCRIPTORS } from "./agent-metadata.js";
const supported = new Set(Object.keys(CONFIGURATION_AGENT_DESCRIPTORS));
export class ConfigurationRegistry {
    adapters = new Map();
    descriptors = new Map();
    register(adapter, descriptor = CONFIGURATION_AGENT_DESCRIPTORS[adapter.id]) {
        if (!supported.has(adapter.id) || this.adapters.has(adapter.id))
            invalid("Unknown or duplicate configuration capability");
        integer(adapter.version, "adapterVersion");
        integer(adapter.schemaVersion, "schemaVersion");
        if (!adapter.scopes.length || adapter.scopes.some((scope) => !["session", "project", "global"].includes(scope)))
            invalid("Invalid adapter scope");
        if (adapter.persistence !== "local_transaction" && adapter.persistence !== "external_control")
            invalid("Invalid adapter persistence");
        if (adapter.persistence === "local_transaction" && !adapter.apply)
            invalid("Local adapters require a synchronous domain apply");
        if (adapter.persistence === "external_control" && (!adapter.externalControl?.submit || !adapter.externalControl.resolve))
            invalid("External adapters require an idempotent submit and authoritative fenced resolve port");
        if (!descriptor?.label || !Object.keys(descriptor.fields).length)
            invalid("Registered capabilities require finite Agent metadata");
        this.adapters.set(adapter.id, adapter);
        this.descriptors.set(adapter.id, structuredClone(descriptor));
        return this;
    }
    get(id) {
        const adapter = this.adapters.get(id);
        if (!adapter)
            throw new ConfigurationError("CONFIGURATION_CAPABILITY_UNAVAILABLE", "This configuration capability is not available", 409);
        return adapter;
    }
    lookup(id) { return this.adapters.get(id); }
    list() {
        return [...this.adapters.values()].map((adapter) => ({ id: adapter.id, adapterVersion: adapter.version, schemaVersion: adapter.schemaVersion, scopes: [...adapter.scopes], persistence: adapter.persistence, autoApplyEligible: adapter.autoApplyEligible === true }));
    }
    describe() {
        return this.list().map(capability => ({ ...capability, ...this.descriptors.get(capability.id) }));
    }
    fields(id) { this.get(id); return structuredClone(this.descriptors.get(id).fields); }
    agentValues(id, input) {
        const adapter = this.get(id);
        const fields = this.descriptors.get(adapter.id).fields;
        if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => !Object.hasOwn(fields, key)))
            invalid("Unknown registered Agent field");
        return adapter.normalize(input);
    }
}
