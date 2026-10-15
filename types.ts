/**
 * Shared types for the search extension.
 *
 * Tool input/output shape, provider adapter interface, classifier result shape.
 *
 * Two tools, two provider sets, no overlap:
 *   - search     -> general web search via Exa/Brave/Tavily/OpenAI
 *   - retrieve   -> URL extraction via Jina/Trafilatura/crawl4ai
 */

export type Verbosity = "concise" | "normal" | "detailed";

/** search() providers. Jev chooses; we fall back within this set. */
export const SEARCH_PROVIDERS = ["brave", "exa", "tavily"] as const;
export type SearchProvider = (typeof SEARCH_PROVIDERS)[number];

/** retrieve() providers. */
export const RETRIEVE_PROVIDERS = ["trafilatura", "jina", "crawl4ai"] as const;
export type RetrieveProvider = (typeof RETRIEVE_PROVIDERS)[number];

/** retrieve() backend selection. "auto" = single-shot trafilatura; on error
 *  (process failure OR empty body OR unreachable), escalates to jina, then
 *  crawl4ai. Explicit values bypass the chain. */
export const RETRIEVE_BACKENDS = ["auto", "trafilatura", "jina", "crawl4ai"] as const;
export type RetrieveBackend = (typeof RETRIEVE_BACKENDS)[number];

/** A single result. Adapters populate either `snippet` (search hit) or `body`
 *  (extracted page); verbosity decides what the user/model actually sees. */
export interface SearchHit {
	url: string;
	title: string;
	snippet: string;
	/** Full body content for `detailed` verbosity. */
	body?: string;
	source?: string;
}

/** Adapter returns one of these. */
export interface SearchOutput {
	hits: SearchHit[];
	/** Verbosity triggers temp-file writes when truncation hits. */
	fullOutputPath?: string;
	truncated?: boolean;
}

export interface AdapterContext {
	apiKey: string | undefined;
	pi?: { signal?: AbortSignal; modelRegistry?: unknown; cwd?: string };
}

/** search() adapter. URL-shaped queries must reject. */
export interface SearchAdapter {
	readonly name: SearchProvider;
	isReady(query: string, ctx: AdapterContext): boolean | Promise<boolean>;
	search(query: string, maxResults: number, verbosity: Verbosity, ctx: AdapterContext): Promise<SearchOutput>;
}

/** retrieve() adapter. Non-URL inputs must reject. */
export interface RetrieveAdapter {
	readonly name: RetrieveProvider;
	isReady(url: string, ctx: AdapterContext): boolean | Promise<boolean>;
	retrieve(url: string, verbosity: Verbosity, ctx: AdapterContext): Promise<SearchOutput>;
}

/** search() params. */
export interface SearchParams {
	query: string;
	max_results: number;
	verbosity: Verbosity;
}

export interface SearchDetails {
	provider: SearchProvider;
	query: string;
	maxResults: number;
	verbosity: Verbosity;
	hitCount: number;
	truncated?: boolean;
	fullOutputPath?: string;
	/** Provider-name probability from Jev (or 'heuristic'). */
	providerProbability?: number;
	providerChoice?: string;
	error?: string;
}

/** retrieve() params. */
export interface RetrieveParams {
	url: string;
	verbosity: Verbosity;
	backend?: RetrieveBackend;
}

export interface RetrieveAttempt {
	provider: RetrieveProvider;
	ok: boolean;
	reason?: string;
}

export interface RetrieveDetails {
	/** Backend that produced the returned content. May differ from the chain
	 *  starter if escalation kicked in. */
	provider: RetrieveProvider;
	url: string;
	verbosity: Verbosity;
	truncated?: boolean;
	fullOutputPath?: string;
	/** All backends that ran (i.e. were called, not just `isReady` skipped),
	 *  in order, with success status. */
	attempts: RetrieveAttempt[];
	/** Human-friendly descriptors for the chain (e.g. ["local, fast", "cloud"]).
	 *  Last item is the successful backend. Computed in router so renderer
	 *  doesn't need to know backend names. */
	attemptChain: string[];
	/** Descriptor of the first backend to be tried (the chain starter). Used
	 *  by renderCall so the live "attempting:" line shows the actual starter
	 *  rather than "auto" when backend is implicit. */
	attempting: string;
	error?: string;
}

/** Map a backend to its short descriptor for the attempt chain UI. */
export function descriptorFor(provider: RetrieveProvider): string {
	switch (provider) {
		case "trafilatura":
			return "local, fast";
		case "jina":
			return "cloud";
		case "crawl4ai":
			return "local, slow";
	}
}

/** Reasonable sanity: does this string look like an http(s) URL? */
export function isUrlLike(s: string): boolean {
	return /^https?:\/\/\S+$/i.test(s.trim());
}
