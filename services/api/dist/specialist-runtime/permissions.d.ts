import type { AgentPermissionRuntimeBindings } from "@sciencediscovery/governance";
/** External children share the live permission cell, but never inherit a
 * native backend's claim that its own approval engine already authorized code. */
export declare function routeSpecialistPermissions(native: AgentPermissionRuntimeBindings["requestPermission"], platform: AgentPermissionRuntimeBindings["requestPermission"], externalExecutions: ReadonlySet<string>): AgentPermissionRuntimeBindings["requestPermission"];
