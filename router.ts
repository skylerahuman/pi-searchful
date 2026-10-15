/**
 * Two routers, two tools:
 *   - dispatchSearch(): Jev (or heuristic) picks a provider, fallback to next.
 *   - dispatchRetrieve(): strict chain trafilatura -> jina -> crawl4ai.
 *     Escalation happens *inside the tool* on real failures, NOT on
 *     model-judged "content wasn't good enough". The model decides whether
 *     good content is sufficient; the tool decides whether the extraction
 *     worked.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateHead } from "./truncate";
import { keyFor } from "./config";
import {
	ClassifierCallFailed,
	ClassifierNotAttached,
	chooseProvider,
	heuristicProvider,
	registryFromContext,
	type ProviderDecision,
} from "./classifier";
import {
	type AdapterContext,
	type RetrieveAdapter,
	type RetrieveAttempt,
	type RetrieveBackend,
	type RetrieveProvider,
	type SearchAdapter,
	type SearchHit,
	type SearchOutput,
	type SearchParams,
	type Verbosity,
	type RetrieveParams,
	descriptorFor,
} from "./types";
import { brave } from "./providers/brave";
import { exa } from "./providers/exa";
import { tavily } from "./providers/tavily";
import { jina } from "./providers/jina";
import { trafilatura } from "./providers/trafilatura";
import { crawl4ai } from "./providers/crawl4ai";

const SEARCH_ADAPTERS: Record<string, SearchAdapter> = {
	brave,
	exa,
	tavily,
};

const RETRIEVE_ADAPTERS: Record<RetrieveProvider, RetrieveAdapter> = {
	trafilatura,
	jina,
	crawl4ai,
};

const AUTO_CHAIN: RetrieveProvider[] = ["trafilatura", "jina", "crawl4ai"];
const SEARCH_PROVIDER_PRIORITY = ["brave", "exa", "tavily"] as const;

export interface SearchRouterResult {
	output: SearchOutput;
	provider: ProviderDecision;
}

export interface RetrieveRouterResult {
	output: SearchOutput;
	provider: RetrieveProvider;
	attempts: RetrieveAttempt[];
	/** Sequence of attempted-backend descriptors in order. The successful
	 *  backend is the last entry. Empty if nothing was attempted. */
	attemptChain: string[];
}

export async function dispatchSearch(
	params: SearchParams,
	signal: AbortSignal | undefined,
	ctx: ExtensionContext,
): Promise<SearchRouterResult> {
	const registry = registryFromContext(ctx);
	let decision: ProviderDecision;
	try {
		decision = await chooseProvider(params.query, registry, signal ?? new AbortController().signal);
	} catch (err) {
		if (err instanceof ClassifierNotAttached) {
			decision = heuristicProvider(params.query);
		} else if (err instanceof ClassifierCallFailed) {
			throw err;
		} else {
			throw err;
		}
	}

	let adapter: SearchAdapter | undefined = SEARCH_ADAPTERS[decision.provider];
	const tried: string[] = [];
	if (!adapter || !(await adapter.isReady(params.query, searchCtx(decision.provider, ctx, signal)))) {
		for (const name of SEARCH_PROVIDER_PRIORITY) {
			if (name === decision.provider) continue;
			const candidate = SEARCH_ADAPTERS[name];
			tried.push(name);
			if (candidate && (await candidate.isReady(params.query, searchCtx(name, ctx, signal)))) {
				adapter = candidate;
				decision = { ...decision, provider: name };
				break;
			}
		}
	}
	if (!adapter) {
		throw new Error(
			`No search provider available. Tried: ${[...SEARCH_PROVIDER_PRIORITY].join(", ")}. ` +
				`Add API keys to .env or run /search-check.`,
		);
	}

	const raw = await adapter.search(params.query, params.max_results, params.verbosity, searchCtx(adapter.name, ctx, signal));
	const output = await applyVerbosity(raw, params.verbosity);
	return { output, provider: decision };
}

/**
 * retrieve() router.
 *
 * backend param semantics:
 *   - "auto"        try trafilatura, escalate to jina on real failure
 *                   (process error, network error, JSON parse error, OR
 *                   empty extracted body), escalate to crawl4ai if jina
 *                   also fails. Single-shot success returns immediately,
 *                   even if content is short; the model decides whether
 *                   it was sufficient.
 *   - explicit name only run that backend; do not escalate. Empty body
 *                   in explicit mode still returns (tool ran successfully),
 *                   so the model can see "nothing here" rather than guessing.
 */
export async function dispatchRetrieve(
	params: RetrieveParams,
	signal: AbortSignal | undefined,
	ctx: ExtensionContext,
	onAttempt?: (descriptor: string) => void,
): Promise<RetrieveRouterResult> {
	const backend: RetrieveBackend = params.backend ?? "auto";
	const order: RetrieveProvider[] = backend === "auto"
		? AUTO_CHAIN
		: [backend as RetrieveProvider];

	const attempts: RetrieveAttempt[] = [];
	const chain: string[] = [];
	for (const name of order) {
		const a = RETRIEVE_ADAPTERS[name];
		const ac = retrieveCtx(name, ctx, signal);

		const ready = await a.isReady(params.url, ac);
		if (!ready) {
			attempts.push({ provider: name, ok: false, reason: "not-ready" });
			if (backend !== "auto") {
				throw new Error(
					`retrieve(): backend "${backend}" is not ready. ` +
						(name === "jina" ? "Set JINA_API_KEY in .env." :
						 name === "crawl4ai" ? "Start the crawl4ai server or omit backend to use auto." :
						 "Unknown reason."),
				);
			}
			continue;
		}

		const descriptor = descriptorFor(name);
		chain.push(descriptor);
		onAttempt?.(descriptor);
		try {
			const raw = await a.retrieve(params.url, params.verbosity, ac);
			const totalTextLength = raw.hits.reduce(
				(n, h) => n + (h.body?.length ?? 0) + h.snippet.length,
				0,
			);
			if (totalTextLength === 0) {
				attempts.push({ provider: name, ok: false, reason: "empty body" });
				if (backend !== "auto") {
					const output = await applyVerbosity(raw, params.verbosity);
					return { output, provider: name, attempts, attemptChain: chain };
				}
				continue;
			}
			const output = await applyVerbosity(raw, params.verbosity);
			attempts.push({ provider: name, ok: true });
			return { output, provider: name, attempts, attemptChain: chain };
		} catch (err) {
			attempts.push({ provider: name, ok: false, reason: (err as Error).message });
			if (backend !== "auto") {
				throw new Error(`retrieve(${backend}) failed: ${(err as Error).message}`);
			}
		}
	}

	throw new Error(
		`retrieve(): all backends failed for ${params.url}. ` +
			`Attempts: ${attempts.map((a) => `${a.provider}=${a.reason ?? "ok"}`).join(", ")}. ` +
			`Install trafilatura, set JINA_API_KEY, or start crawl4ai.`,
	);
}

function searchCtx(provider: string, ctx: ExtensionContext, signal?: AbortSignal): AdapterContext {
	return { apiKey: keyFor(provider), pi: { ...ctx, signal } };
}

function retrieveCtx(provider: string, ctx: ExtensionContext, signal?: AbortSignal): AdapterContext {
	return { apiKey: keyFor(provider), pi: { ...ctx, signal } };
}

async function applyVerbosity(out: SearchOutput, verbosity: Verbosity): Promise<SearchOutput> {
	const reduced: SearchHit[] = out.hits.map((h) => reduceHit(h, verbosity));
	const lines = reduced.map(formatHit).join("\n\n");
	const trunc = await truncateHead(lines);
	return {
		hits: reduced,
		truncated: trunc.truncated,
		fullOutputPath: trunc.fullOutputPath,
	};
}

function reduceHit(h: SearchHit, v: Verbosity): SearchHit {
	if (v === "concise") {
		return { url: h.url, title: h.title, snippet: firstN(h.snippet, 180), source: h.source };
	}
	if (v === "normal") {
		return { url: h.url, title: h.title, snippet: firstN(h.snippet, 600), source: h.source };
	}
	return h;
}

function firstN(s: string, n: number): string {
	const t = s.trim().replace(/\s+/g, " ");
	return t.length <= n ? t : t.slice(0, n - 1) + "\u2026";
}

function formatHit(h: SearchHit): string {
	const head = `${h.title}\n${h.url}`;
	if (h.snippet) return `${head}\n${h.snippet}`;
	if (h.body) return `${head}\n${h.body}`;
	return head;
}
