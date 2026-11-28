import { filterEnabledMcpSources } from "@sciencediscovery/mcp-sources";
import { digest } from "./validation.js";
/** A refusal applies to its task and relevant configuration need. Unrelated
 * model, Skill or reviewer edits must not invite the same connector card again. */
export function configurationNeedKey(input) {
    const effective = input.snapshot.data.effective;
    const installed = input.snapshot.data.installedConnectorIds;
    const baseline = input.capabilityId === "connector.enable" ? {
        installed: installed?.includes(input.target) ?? false,
        enabled: effective?.enabledConnectorIds.includes(input.target) ?? false,
        permitted: effective ? filterEnabledMcpSources([input.target], effective.plugins).includes(input.target) : false,
        connectorCatalog: input.snapshot.resourceVersions.connectorCatalog,
        policies: input.snapshot.resourceVersions.policies,
    } : input.snapshot.resourceVersions;
    return digest({ runId: input.runId, capabilityId: input.capabilityId, target: input.target, baseline });
}
