/**
 * Tavily search - general web, research-grade.
 */

import { fetchJson } from "../http";
import { isUrlLike, type SearchAdapter, type SearchHit, type SearchOutput } from "../types";

const ENDPOINT = "https://api.tavily.com/search";

interface TavilyResult {
	url: string;
	title: string;
	content?: string;
	raw_content?: string;
}

interface TavilyResponse {
	answer?: string;
	results?: TavilyResult[];
}

export const tavily: SearchAdapter = {
	name: "tavily",
	async isReady(query, ctx) {
		if (isUrlLike(query)) return false;
		return !!ctx.apiKey;
	},
	async search(query, maxResults, verbosity, ctx) {
		const key = ctx.apiKey;
		if (!key) throw new Error("tavily: missing TAVILY_API_KEY");
		const body = {
			query,
			max_results: maxResults,
			include_answer: true,
			include_raw_content: verbosity === "detailed",
			topic: "general",
		};
		const resp = await fetchJson<TavilyResponse>({
			method: "POST",
			url: ENDPOINT,
			headers: { Authorization: `Bearer ${key}` },
			body,
		});
		const hits: SearchHit[] = (resp.results ?? []).map((r) => ({
			url: r.url,
			title: r.title,
			snippet: r.content ?? "",
			body: verbosity === "detailed" ? r.raw_content ?? r.content ?? "" : undefined,
			source: "tavily",
		}));
		if (resp.answer) {
			hits.unshift({
				url: "tavily://answer",
				title: "Tavily answer",
				snippet: resp.answer,
				source: "tavily",
			});
		}
		return { hits };
	},
};
