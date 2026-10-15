/**
 * Brave search - general web search.
 */

import { fetchJson } from "../http";
import { isUrlLike, type SearchAdapter, type SearchHit, type SearchOutput } from "../types";

const ENDPOINT = "https://api.search.brave.com/res/v1/web/search";

interface BraveResult {
	url: string;
	title: string;
	description?: string;
}

interface BraveResponse {
	web?: { results?: BraveResult[] };
}

export const brave: SearchAdapter = {
	name: "brave",
	async isReady(query, ctx) {
		if (isUrlLike(query)) return false;
		return !!ctx.apiKey;
	},
	async search(query, maxResults, _verbosity, ctx) {
		const key = ctx.apiKey;
		if (!key) throw new Error("brave: missing BRAVE_API_KEY");
		const u = new URL(ENDPOINT);
		u.searchParams.set("q", query);
		u.searchParams.set("count", String(maxResults));
		u.searchParams.set("safesearch", "moderate");
		const resp = await fetchJson<BraveResponse>({
			url: u.toString(),
			headers: { "X-Subscription-Token": key, Accept: "application/json" },
		});
		const hits: SearchHit[] = (resp.web?.results ?? []).map((r) => ({
			url: r.url,
			title: r.title,
			snippet: r.description ?? "",
			source: "brave",
		}));
		return { hits };
	},
};
