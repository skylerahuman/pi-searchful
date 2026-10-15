/**
 * Jina Reader - URL extraction. https://jina.ai/reader/
 *
 * GET https://r.jina.ai/{url}
 *   headers: Authorization: Bearer $KEY, X-Respond-With: markdown
 *
 * Jina takes a URL and returns clean markdown. Requires JINA_API_KEY.
 */

import { fetchText } from "../http";
import { isUrlLike, type RetrieveAdapter, type SearchHit, type SearchOutput } from "../types";

export const jina: RetrieveAdapter = {
	name: "jina",
	async isReady(url, ctx) {
		return isUrlLike(url) && !!ctx.apiKey;
	},
	async retrieve(url, verbosity, ctx) {
		const key = ctx.apiKey;
		if (!key) throw new Error("jina: missing JINA_API_KEY");
		const text = await fetchText({
			url: `https://r.jina.ai/${url}`,
			headers: {
				Authorization: `Bearer ${key}`,
				Accept: verbosity === "concise" ? "text/plain" : "application/json",
				"X-Respond-With": "markdown",
				"X-Return-Format": "markdown",
			},
		});
		const titleMatch = text.match(/^Title:\s*(.+)$/m);
		const title = titleMatch?.[1]?.trim() ?? url;
		const bodyStart = text.indexOf("\n\n");
		const body = bodyStart >= 0 ? text.slice(bodyStart + 2).trim() : text;
		const snippet =
			verbosity === "concise"
				? firstChars(body, 240)
				: verbosity === "normal"
					? firstChars(body, 800)
					: firstChars(body, 1500);
		const hits: SearchHit[] = [
			{
				url,
				title,
				snippet,
				body: verbosity === "detailed" ? body : undefined,
				source: "jina",
			},
		];
		return { hits };
	},
};

function firstChars(s: string, n: number): string {
	const t = s.replace(/\s+/g, " ").trim();
	return t.length <= n ? t : t.slice(0, n - 1) + "\u2026";
}
