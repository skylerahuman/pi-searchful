/**
 * Preflight for two tools, two provider sets.
 */

import { spawnSync } from "node:child_process";
import { config } from "./config";
import {
	type RetrieveProvider,
	type SearchProvider,
} from "./types";

export const CLASSIFIER_CANDIDATES = [
	{ type: "classifier", provider: "typesafe", id: "jev-latest", label: "typesafe/jev-latest (TYPESAFE_API_KEY)" },
	{ type: "classifier", provider: "openrouter", id: "typesafe/jev-1.13", label: "openrouter/typesafe/jev-1.13 (OPENROUTER_API_KEY)" },
	{ type: "classifier", provider: "cloudflare-workers-ai", id: "typesafe/jev", label: "cloudflare-workers-ai/typesafe/jev" },
	{ type: "classifier", provider: "vercel-ai-gateway", id: "typesafe-ai/jev", label: "vercel-ai-gateway/typesafe-ai/jev" },
] as const;

export interface ClassifierProbe {
	candidate: (typeof CLASSIFIER_CANDIDATES)[number];
	found: boolean;
	modelId?: string;
	error?: string;
}

export interface PreflightReport {
	searchKeys: Record<SearchProvider, boolean>;
	retrieveKeys: Record<RetrieveProvider, boolean>;
	clis: Record<string, boolean>;
	classifier: ClassifierProbe[];
	classifierReady: boolean;
	searchReady: boolean;
	retrieveReady: boolean;
}

export function preflightStatic(): Omit<
	PreflightReport,
	"classifier" | "classifierReady" | "searchReady" | "retrieveReady" | "searchKeys" | "retrieveKeys"
> & {
	searchKeys: Record<SearchProvider, boolean>;
	retrieveKeys: Record<RetrieveProvider, boolean>;
} {
	const searchKeys: Record<SearchProvider, boolean> = {
		brave: !!config.brave,
		exa: !!config.exa,
		tavily: !!config.tavily,
	};
	const retrieveKeys: Record<RetrieveProvider, boolean> = {
		jina: !!config.jina,
		trafilatura: cliOk("trafilatura"),
		crawl4ai: false, // probed via server health
	};
	const clis: Record<string, boolean> = {
		rg: cliOk("rg"),
		trafilatura: cliOk("trafilatura"),
		crawl4ai: cliOk("crawl4ai"),
		curl: cliOk("curl"),
	};
	return { searchKeys, retrieveKeys, clis };
}

export async function preflightClassifier(
	registry: { findOfType?: (type: string, provider: string, id: string) => unknown } | undefined,
): Promise<{ classifier: ClassifierProbe[]; classifierReady: boolean }> {
	if (!registry || typeof registry.findOfType !== "function") {
		return {
			classifier: CLASSIFIER_CANDIDATES.map((c) => ({
				candidate: c,
				found: false,
				error: "ctx.modelRegistry missing or has no findOfType",
			})),
			classifierReady: false,
		};
	}
	const probes: ClassifierProbe[] = [];
	for (const c of CLASSIFIER_CANDIDATES) {
		try {
			const m = registry.findOfType(c.type, c.provider, c.id);
			probes.push(m ? { candidate: c, found: true, modelId: c.id } : { candidate: c, found: false });
		} catch (err) {
			probes.push({ candidate: c, found: false, error: (err as Error).message });
		}
	}
	return { classifier: probes, classifierReady: probes.some((p) => p.found) };
}

function cliOk(bin: string): boolean {
	try {
		const r = spawnSync(bin, ["--version"], { stdio: "ignore" });
		return r.status === 0;
	} catch {
		return false;
	}
}

export function formatReport(r: PreflightReport): string {
	const lines: string[] = [];
	lines.push("Search extension preflight");
	lines.push("===========================");
	lines.push("");
	lines.push("Classifier (Jev, used to pick a search() provider):");
	if (r.classifier.length === 0) {
		lines.push("  (not probed - run /search-check from inside Pi)");
	} else {
		for (const p of r.classifier) {
			if (p.found) lines.push(`  ok   ${p.candidate.label}`);
			else if (p.error) lines.push(`  err  ${p.candidate.label} - ${p.error}`);
			else lines.push(`  miss ${p.candidate.label}`);
		}
		lines.push(r.classifierReady
			? "  -> Jev is reachable; routing decisions will use the LLM."
			: "  -> No Jev classifier attached; routing falls back to heuristic.");
	}
	lines.push("");
	lines.push("search() providers (general-web):");
	for (const [name, ok] of Object.entries(r.searchKeys)) {
		lines.push(`  ${ok ? "ok  " : "miss"} ${name}`);
	}
	lines.push("");
	lines.push("retrieve() providers (URL extraction), tried in order: trafilatura -> jina -> crawl4ai");
	for (const [name, ok] of Object.entries(r.retrieveKeys)) {
		lines.push(`  ${ok ? "ok  " : "miss"} ${name}`);
	}
	lines.push("");
	lines.push("System CLIs:");
	for (const [name, ok] of Object.entries(r.clis)) {
		lines.push(`  ${ok ? "ok  " : "miss"} ${name}`);
	}
	lines.push("");
	const searchVerdict = r.searchReady
		? "search(): ready (classifier online or at least one provider key set)"
		: r.classifierReady
			? "search(): degraded (no provider keys, classifier can route but every adapter is unready)"
			: "search(): not ready - configure API keys";
	const retrieveVerdict = r.retrieveReady
		? "retrieve(): ready (at least one URL extractor available)"
		: "retrieve(): not ready - install trafilatura or set JINA_API_KEY";
	lines.push(searchVerdict);
	lines.push(retrieveVerdict);
	return lines.join("\n");
}
