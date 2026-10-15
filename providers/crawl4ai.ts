/**
 * crawl4ai - URL extraction. https://crawl4ai.com/
 *
 *   POST {CRAWL4AI_BASE_URL}/crawl  { urls: [string] }
 *   GET  {CRAWL4AI_BASE_URL}/health
 *
 * Heavyweight: prefers full-site / JS-rendered crawling. Requires the
 * crawl4ai server to be running locally.
 */

import { fetchJson } from "../http";
import { config } from "../config";
import { isUrlLike, type RetrieveAdapter, type SearchHit, type SearchOutput } from "../types";

interface Crawl4aiResult {
	url?: string;
	markdown?: { raw?: string; fit_markdown?: string };
	metadata?: { title?: string };
}

interface Crawl4aiResponse {
	results?: Crawl4aiResult[];
}

export const crawl4ai: RetrieveAdapter = {
	name: "crawl4ai",
	async isReady(url) {
		return isUrlLike(url) && (await pingHealth());
	},
	async retrieve(url, verbosity, _ctx) {
		if (!isUrlLike(url)) throw new Error(`crawl4ai: expected URL, got "${url}"`);
		const resp = await fetchJson<Crawl4aiResponse>({
			method: "POST",
			url: `${config.crawl4aiBaseUrl}/crawl`,
			headers: config.crawl4aiApiKey ? { Authorization: `Bearer ${config.crawl4aiApiKey}` } : {},
			body: { urls: [url], priority: 5 },
		});
		const r = resp.results?.[0];
		const title = r?.metadata?.title ?? url;
		const body = r?.markdown?.fit_markdown ?? r?.markdown?.raw ?? "";
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
				source: "crawl4ai",
			},
		];
		return { hits };
	},
};

async function pingHealth(): Promise<boolean> {
	try {
		await fetchJson<{ status?: string }>({
			url: `${config.crawl4aiBaseUrl}/health`,
			timeoutMs: 1500,
		});
		return true;
	} catch {
		return false;
	}
}

function firstChars(s: string, n: number): string {
	const t = s.replace(/\s+/g, " ").trim();
	return t.length <= n ? t : t.slice(0, n - 1) + "\u2026";
}
