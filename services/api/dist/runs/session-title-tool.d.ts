import { type Session } from "@sciencediscovery/schema";
import type { AgentTool } from "@sciencediscovery/tools";
import { Type } from "typebox";
import type { SessionStore } from "../store.js";
declare const parameters: Type.TObject<{
    title: Type.TString;
    expected_title: Type.TString;
    reason: Type.TUnion<[Type.TLiteral<"initial_topic">, Type.TLiteral<"topic_change">, Type.TLiteral<"user_request">]>;
}>;
export declare function sessionTitleInstructions(title: string): string;
/** Only the lead receives this capability; the session identity is never model-controlled. */
export declare function createSessionTitleTool(store: Pick<SessionStore, "getSession" | "compareAndSetSessionTitle">, sessionId: string, onUpdated: (session: Session) => Promise<void>): AgentTool<typeof parameters>;
export {};
