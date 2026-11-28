import type { ConfigurationCapabilityId } from "@sciencediscovery/schema";
import type { ConfigurationSnapshot } from "./types.js";
/** A refusal applies to its task and relevant configuration need. Unrelated
 * model, Skill or reviewer edits must not invite the same connector card again. */
export declare function configurationNeedKey(input: {
    runId?: string;
    capabilityId: ConfigurationCapabilityId;
    target: string;
    snapshot: ConfigurationSnapshot;
}): string;
