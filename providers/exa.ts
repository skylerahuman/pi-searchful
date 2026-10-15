/**
 * Exa search - general web search, semantic recall.
 */

import { fetchJson } from "../http";
import { isUrlLike, type SearchAdapter, type SearchHit, type SearchOutput } from "../types";

const ENDPOINT = "https://api.exa.ai/search";

interface ExaResult {
	url: string;
	title?: string;
	text?: string;
	highlights?: string[];
	highlight?: string[];
	snippet?: string;
}

interface ExaResponse {
	results?: ExaResult[];
}

export const exa: SearchAdapter = {
	name: "exa",
	async isReady(query, ctx) {
		if (isUrlLike(query)) return false;
		return !!ctx.apiKey;
	},
	async search(query, maxResults, verbosity, ctx) {
		const key = ctx.apiKey;
		if (!key) throw new Error("exa: missing EXA_API_KEY");
		const body: Record<string, unknown> = { query, numResults: maxResults };
		if (verbosity === "detailed") {
			body.contents = { text: true, highlights: { numSentences: 5, highlightsPerUrl: 1 } };
		} else if (verbosity === "normal") {
			body.contents = { highlights: { numSentences: 3, highlightsPerUrl: 1 } };
		}
		const resp = await fetchJson<ExaResponse>({
			method: "POST",
			url: ENDPOINT,
			headers: { "x-api-key": key },
			body,
		});
		const hits: SearchHit[] = (resp.results ?? []).map((r) => ({
			url: r.url,
			title: r.title ?? r.url,
			snippet: r.highlights?.[0] ?? r.highlight?.[0] ?? r.snippet ?? "",
			body: verbosity === "detailed" ? r.text ?? "" : undefined,
			source: "exa",
		}));
		return { hits };
	},
};
