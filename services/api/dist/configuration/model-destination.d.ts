import { type ConfigurationEndpointAuthorization, type ModelProfile } from "@sciencediscovery/schema";
import type { DatabaseSync } from "node:sqlite";
import type { ConfigurationRecord, ConfigurationPlan, ConfigurationAdapterContext } from "./types.js";
type Destination = NonNullable<ConfigurationPlan["endpointAuthorization"]>;
type DestinationRecord = Pick<ConfigurationRecord, "input" | "plan"> & {
    view: Pick<ConfigurationRecord["view"], "id" | "sessionId" | "revision" | "capabilityId">;
};
/** Exact protocol and wire URL, never a provider's user-editable display name. */
export declare function modelDestination(profile: Pick<ModelProfile, "baseUrl" | "model" | "apiProtocol" | "apiVariant">): Destination;
/** User-only authorizations are separate from Agent proposal inputs and bind
 * exact request/revision/destination. No token is stored in this journal. */
export declare class ModelDestinationAuthorizer {
    private readonly database;
    constructor(database: DatabaseSync);
    view(record: DestinationRecord): ConfigurationEndpointAuthorization | undefined;
    assert(record: DestinationRecord, credential: boolean): void;
    assertForContext(context: ConfigurationAdapterContext, capabilityId: DestinationRecord["view"]["capabilityId"], credential: boolean): void;
    assertContext(context: ConfigurationAdapterContext, capabilityId: DestinationRecord["view"]["capabilityId"], profile: ModelProfile, credential: boolean): void;
    confirm(record: ConfigurationRecord, input: unknown): void;
    rebind(requestId: string, sessionId: string, from: number, to: number, destination: string): void;
}
export {};
