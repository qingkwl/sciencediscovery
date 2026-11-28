import { type ModelProfile } from "@sciencediscovery/schema";
/** Why this endpoint cannot be told to stop thinking, or `undefined` if it can. */
export type ThinkingControlGap = "no-control-field" | "no-disabled-mode" | "declared-unsupported" | "model-unsupported";
/**
 * Why this endpoint cannot be *told* to stop thinking.
 *
 * The distinction matters to a budget, not to a form: a dialect with no
 * thinking-control field accepts `thinking: {type: "disabled"}` and ignores it,
 * so a run that believes it turned thinking off pays for reasoning it never
 * sees. Measured on a custom gateway: every mutation came back exactly at the
 * quiet 16k per-call ceiling with no content at all.
 *
 * Mapping a field is not enough: `gemini` and `kimi-k3` carry a thinking
 * toggle without a "disabled" stop, so asking them to stop has the same
 * effect as a dialect that never hears the request.
 *
 * Three sources answer three different questions, and they are not
 * interchangeable. The profile's configured dialect decides whether the wire
 * has a control field at all — the catalog's `apiVariant` describes the
 * vendor's own endpoint, and a gateway that reuses a model name may speak
 * something else, so reading it here could promise a field this run never
 * sends. The catalog (or the dialect's known stops, for a model it has never
 * heard of) decides which stops exist. `facts.thinkingSupported` is the
 * operator's own statement that this endpoint does or does not honor the
 * field, and it wins over both; it cannot conjure a "disabled" stop the
 * dialect does not offer, because "the field is heard" and "the field carries
 * disabled" are separate questions.
 */
export declare function thinkingControlGap(model: ModelProfile | undefined): ThinkingControlGap | undefined;
export declare function endpointCanDisableThinking(model: ModelProfile | undefined): boolean;
