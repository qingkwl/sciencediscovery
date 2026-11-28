import type { AgentTool } from "@sciencediscovery/tools";
import type { SessionStore } from "../store.js";
/** Main-agent configuration has no secret argument. Credential collection is
 * through the pending child card/API, outside persisted tool arguments. */
export declare function mainRuntimeConfigTool(store: SessionStore): AgentTool;
