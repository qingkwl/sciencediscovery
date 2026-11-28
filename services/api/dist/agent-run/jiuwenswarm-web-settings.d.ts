import type { WebKeyProvider, WebSettings } from "@sciencediscovery/schema";
import type { JiuwenSwarmAgentConfig } from "./jiuwenswarm-agent.js";
/**
 * The web settings as JiuwenSwarm's own configuration, for `config.set`.
 *
 * With the JiuwenSwarm backend web search is JiuwenSwarm's, so the settings page is where its search is
 * configured: its two free engines (DuckDuckGo, Bing) and the keys of its paid search (Jina, Bocha, Serper,
 * Perplexity), plus opt-in DeepSeek search/fetch. A key that is not saved is sent empty, which clears it there. Nothing else in the web settings
 * has a JiuwenSwarm counterpart except the DeepSeek enable/selection fields below.
 */
export declare function jiuwenSwarmWebConfig(settings: WebSettings, key: (provider: WebKeyProvider) => string | undefined): Record<string, string>;
/** Send the web settings to JiuwenSwarm through the adapter. Never throws: a failure is logged and returned. */
export declare function syncWebSettingsToJiuwenSwarm(config: Pick<JiuwenSwarmAgentConfig, "adapterToken" | "adapterUrl" | "fetch">, settings: WebSettings, key: (provider: WebKeyProvider) => string | undefined): Promise<{
    ok: boolean;
    error?: string;
}>;
export type JiuwenSwarmWebResult = {
    kind: "search";
    toolName: string;
    rows: Array<{
        url: string;
        title?: string;
        snippet?: string;
    }>;
} | {
    kind: "fetch";
    toolName: string;
    url: string;
    content: string;
};
/**
 * What JiuwenSwarm's own web tools returned, as a result to record in the memory graph like ours.
 *
 * `free_search` lists hits as "N. title / URL: ... / Snippet: ..."; `paid_search` gives an answer and then its
 * sources under "URLs:"; `fetch_webpage` returns the page, whose address is in the call's arguments. A failed
 * call ("[ERROR]: ...") or an empty one records nothing.
 */
export declare function jiuwenSwarmWebResult(toolName: string, args: Record<string, unknown>, output: string): JiuwenSwarmWebResult | undefined;
