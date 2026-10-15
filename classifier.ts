/**
 * Jev classifier wrapper for the search() tool.
 *
 * Single choice question: which general-web provider should I use for this
 * query? Criteria names must match SEARCH_PROVIDERS.
 */

import type {
	ModelRouteRequest,
	ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import { SEARCH_PROVIDERS, type SearchProvider } from "./types";
import { CLASSIFIER_CANDIDATES } from "./preflight";

export class ClassifierNotAttached extends Error {
	constructor() {
		super(
			"No Jev classifier is attached. Searched: " +
				CLASSIFIER_CANDIDATES.map((c) => c.label).join(", "),
		);
		this.name = "ClassifierNotAttached";
	}
}

export class ClassifierCallFailed extends Error {
	readonly cause: unknown;
	constructor(message: string, cause: unknown) {
		super(message);
		this.name = "ClassifierCallFailed";
		this.cause = cause;
	}
}

export interface ProviderDecision {
	provider: SearchProvider;
	probability: number;
	choice: string;
}

export function findClassifier(
	registry: ModelRegistry,
): { provider: string; id: string; model: unknown } | undefined {
	const r = registry as unknown as {
		findOfType?: (type: string, provider: string, id: string) => unknown;
	};
	if (typeof r.findOfType !== "function") return undefined;
	for (const c of CLASSIFIER_CANDIDATES) {
		const m = r.findOfType(c.type, c.provider, c.id);
		if (m) return { provider: c.provider, id: c.id, model: m };
	}
	return undefined;
}

export async function chooseProvider(
	query: string,
	registry: ModelRegistry,
	signal: AbortSignal,
): Promise<ProviderDecision> {
	const found = findClassifier(registry);
	if (!found) throw new ClassifierNotAttached();
	if (typeof registry.classify !== "function") throw new ClassifierNotAttached();

	const criteria: Record<string, string> = {
		brave: "Index-level breadth; best for news, current events, recent sources.",
		exa: "Semantic similarity search; great for concept-level discovery and rich snippets.",
		tavily: "Research-oriented; returns AI-extracted answers and source citations.",
	};
	try {
		const jevModel = found.model as Parameters<typeof registry.classify>[0];
		const resp = await registry.classify(
			jevModel,
			{
				state: { prompt: query },
				questions: {
					provider: {
						type: "choice",
						instructions:
							"Which general web search backend fits this query? Prefer Exa for semantic/embedding recall; Brave for current news and breadth; Tavily for research-grade answers and AI summaries.",
						criteria,
					},
				},
			},
			{ signal },
		);
		const choice = pickChoice(resp.answers.provider);
		const valid = validate(choice, SEARCH_PROVIDERS) ?? "brave";
		return { provider: valid, probability: prob(resp.answers.provider, valid), choice: valid };
	} catch (err) {
		if (err instanceof ClassifierCallFailed) throw err;
		throw new ClassifierCallFailed(`Jev classify() threw: ${(err as Error).message}`, err);
	}
}

/** Heuristic fallback when classifier unavailable. */
export function heuristicProvider(query: string): ProviderDecision {
	const q = query.toLowerCase();
	if (/\b(news|today|latest|breaking|recent|2026|2025)\b/.test(q)) {
		return { provider: "brave", probability: 0.5, choice: "heuristic" };
	}
	if (/\b(research|study|paper|cite|review|summary)\b/.test(q)) {
		return { provider: "tavily", probability: 0.5, choice: "heuristic" };
	}
	return { provider: "exa", probability: 0.5, choice: "heuristic" };
}

function pickChoice(a: unknown): string {
	if (a && typeof a === "object" && "type" in a && (a as { type: string }).type === "choice") {
		const choice = (a as { choice?: string }).choice;
		if (typeof choice === "string") return choice;
	}
	return "";
}

function prob(a: unknown, choice: string): number {
	if (!a || typeof a !== "object") return 0;
	const probabilities = (a as { probabilities?: Record<string, number> }).probabilities;
	if (!probabilities) return 0;
	const v = probabilities[choice];
	return typeof v === "number" ? v : 0;
}

function validate<T extends string>(value: string, allowed: readonly T[]): T | undefined {
	return (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

export function registryFromContext(ctx: unknown): ModelRegistry {
	const c = ctx as Partial<{ modelRegistry: ModelRegistry }> & Record<string, unknown>;
	if (c.modelRegistry) return c.modelRegistry;
	throw new Error("ExtensionContext.modelRegistry is not available.");
}

export type { ModelRouteRequest };
