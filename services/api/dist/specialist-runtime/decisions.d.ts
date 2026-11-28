export { platformDecisionSchema } from "./decision-contract.js";
import type { SpecialistRuntimeRequest, SpecialistEventSink, SpecialistResult } from "./adapter.js";
/** Both transports are model-only. All code, files, network and artifacts use
 * validated platform tools and the child's live permission/Runner bindings. */
export declare function runPlatformDecisions(request: SpecialistRuntimeRequest, sink: SpecialistEventSink, decide: (prompt: string) => Promise<string>, result?: SpecialistResult): Promise<SpecialistResult>;
