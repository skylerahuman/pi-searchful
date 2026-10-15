/**
 * pi-searchful extension entrypoint.
 *
 * Tools:
 *   - search()    general-web search via Jev-routed Exa / Brave / Tavily
 *   - retrieve()  URL extraction with chain Trafilatura -> Jina -> crawl4ai
 *
 * Commands:
 *   - /searchful-check          readiness report
 *   - /searchful-install-deps   pip install missing CLIs
 *   - /searchful-login          collect API keys -> ~/.pi/agent/auth.json
 */

import {
	defineTool,
	type ExtensionAPI,
	type ExecResult,
} from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";

import { config, repoDir } from "./config";
import { dispatchSearch, dispatchRetrieve } from "./router";
import { preflightClassifier, preflightStatic, formatReport, type PreflightReport } from "./preflight";
import { renderCall, renderResult, renderRetrieveCall, renderRetrieveResult } from "./render";
import { isUrlLike, type SearchDetails, type RetrieveDetails, type Verbosity } from "./types";
import { runLogin } from "./auth";

const SEARCH_VERBOSITIES = ["concise", "normal", "detailed"] as const;
const RETRIEVE_VERBOSITIES = ["normal", "detailed"] as const;

const SearchParams = Type.Object({
	query: Type.String({
		description: "Free-text question. Must NOT be a URL - use retrieve() for URLs.",
		minLength: 1,
	}),
	max_results: Type.Number({
		description: "Maximum results to return.",
		minimum: 1,
		maximum: 25,
		default: config.defaultMaxResults,
	}),
	verbosity: StringEnum([...SEARCH_VERBOSITIES], {
		description: "concise: titles+URL+1-line; normal: +3-sentence summaries; detailed: full body",
		default: config.defaultVerbosity,
	}),
});

const RetrieveParams = Type.Object({
	url: Type.String({
		description: "HTTP(S) URL to extract content from.",
		minLength: 1,
	}),
	verbosity: StringEnum([...RETRIEVE_VERBOSITIES], {
		description: "normal: clean markdown; detailed: full body (truncated if needed)",
		default: "normal",
	}),
	backend: Type.Optional(
		StringEnum(["auto", "trafilatura", "jina", "crawl4ai"] as const, {
			description:
				"auto (default): try trafilatura first; on real failure (process error, network error, JSON parse error, empty body) escalate to jina, then crawl4ai. " +
				"Explicit names disable escalation and run that backend only.",
		}),
	),
});

const search = defineTool({
	name: "search",
	label: "Search",
	description:
		"General web search. Use for open-ended discovery questions (news, background, recent events, factual lookups). " +
		"Routes to Exa (semantic), Brave (news/breadth), or Tavily (research) via the in-process Jev classifier. " +
		"DO NOT pass a URL - use retrieve() for URL extraction. Output: titles, URLs, snippets (and full body for detailed).",
	parameters: SearchParams,
	async execute(_toolCallId, params, signal, _onUpdate, ctx) {
		const details: SearchDetails = {
			provider: "brave",
			query: params.query,
			maxResults: params.max_results,
			verbosity: params.verbosity,
			hitCount: 0,
		};
		if (isUrlLike(params.query)) {
			details.error = "search() expects a non-URL question. Use retrieve() for URL extraction.";
			return {
				content: [{ type: "text", text: details.error }],
				details,
			};
		}
		try {
			const { output, provider } = await dispatchSearch(params, signal, ctx);
			details.provider = provider.provider;
			details.providerProbability = provider.probability;
			details.providerChoice = provider.choice;
			details.hitCount = output.hits.length;
			details.truncated = output.truncated;
			details.fullOutputPath = output.fullOutputPath;
			return {
				content: [{ type: "text", text: output.hits.map(formatSearchHit).join("\n\n") }],
				details,
			};
		} catch (err) {
			details.error = (err as Error).message;
			return {
				content: [{ type: "text", text: `Search failed: ${(err as Error).message}` }],
				details,
			};
		}
	},
	renderCall(args, theme) {
		return renderCall(args, theme);
	},
	renderResult(result, opts, theme) {
		return renderResult(result, opts, theme);
	},
});

const retrieve = defineTool({
	name: "retrieve",
	label: "Retrieve",
	description:
		"Extract clean content from a known URL. Pass a single HTTP(S) URL. " +
		"Default backend chain: Trafilatura (local, fast) -> Jina Reader (cloud) -> crawl4ai (local, slow, optional). " +
		"Escalation happens inside the tool on real failures (process error, network error, JSON parse error, or empty body) - NOT on whether content is 'good enough'. " +
		"You decide whether content is sufficient; if you want more or different, call retrieve() again with a different backend or verbosity. " +
		"Use search() for non-URL questions.",
	parameters: RetrieveParams,
	async execute(_toolCallId, params, signal, onUpdate, ctx) {
		const details: RetrieveDetails = {
			provider: "trafilatura",
			url: params.url,
			verbosity: params.verbosity,
			attempts: [],
			attemptChain: [],
			attempting: params.backend
				? (params.backend === "auto" ? "local, fast" :
					 params.backend === "trafilatura" ? "local, fast" :
					 params.backend === "jina" ? "cloud" :
					 params.backend === "crawl4ai" ? "local, slow" : "auto")
				: "local, fast",
		};
		if (!isUrlLike(params.url)) {
			details.error = `retrieve() expects a URL. Got: "${params.url}". Use search() for non-URL questions.`;
			return {
				content: [{ type: "text", text: details.error }],
				details,
			};
		}
		const onAttempt = (descriptor: string) => {
			details.attemptChain.push(descriptor);
			if (onUpdate) {
				try {
					onUpdate({
						content: [{ type: "text", text: `attempting: ${details.attemptChain.join(" \u2192 ")}` }],
						details: { ...details },
					});
				} catch {
					/* onUpdate not supported in this mode */
				}
			}
		};
		try {
			const { output, provider, attempts, attemptChain } = await dispatchRetrieve(
				params,
				signal,
				ctx,
				onAttempt,
			);
			details.provider = provider;
			details.attempts = attempts;
			details.attemptChain = attemptChain;
			details.truncated = output.truncated;
			details.fullOutputPath = output.fullOutputPath;
			return {
				content: [{ type: "text", text: output.hits.map(formatSearchHit).join("\n\n") }],
				details,
			};
		} catch (err) {
			details.error = (err as Error).message;
			return {
				content: [{ type: "text", text: `Retrieve failed: ${(err as Error).message}` }],
				details,
			};
		}
	},
	renderCall(args, theme) {
		return renderRetrieveCall(args, theme);
	},
	renderResult(result, opts, theme) {
		return renderRetrieveResult(result, opts, theme);
	},
});

function formatSearchHit(h: { url: string; title: string; snippet: string; body?: string }): string {
	return `${h.title}\n${h.url}\n${h.snippet}${h.body ? `\n\n${h.body}` : ""}`;
}

export default function (pi: ExtensionAPI) {
	pi.registerTool(search);
	pi.registerTool(retrieve);

	pi.registerCommand("searchful-check", {
		description: "Show search(), retrieve(), and classifier readiness.",
		handler: async (_args, ctx) => {
			const staticPart = preflightStatic();
			const registry = (ctx as unknown as {
				modelRegistry?: {
					find: (p: string, id?: string) => unknown;
					findOfType?: (t: string, p: string, id: string) => unknown;
				};
			}).modelRegistry;
			const classifierPart = await preflightClassifier(registry);
			const r: PreflightReport = {
				searchKeys: staticPart.searchKeys,
				retrieveKeys: staticPart.retrieveKeys,
				clis: staticPart.clis,
				classifier: classifierPart.classifier,
				classifierReady: classifierPart.classifierReady,
				searchReady: Object.values(staticPart.searchKeys).some(Boolean),
				retrieveReady: Object.values(staticPart.retrieveKeys).some(Boolean),
			};
			ctx.ui.notify(formatReport(r), r.searchReady && r.retrieveReady ? "info" : "warning");
		},
	});

	pi.registerCommand("searchful-install-deps", {
		description: `Best-effort install of missing deps (crawl4ai via pip). Repo dir: ${repoDir}`,
		handler: async (_args, ctx) => {
			const staticPart = preflightStatic();
			const missing: string[] = [];
			if (!staticPart.clis.crawl4ai) missing.push("crawl4ai");
			if (missing.length === 0) {
				ctx.ui.notify("All deps present.", "info");
				return;
			}
			ctx.ui.notify(`Installing: ${missing.join(", ")}...`, "info");
			const cmd = `pip install --user ${missing.join(" ")}`;
			let result: ExecResult;
			try {
				result = await pi.exec("bash", ["-lc", cmd]);
			} catch (err) {
				ctx.ui.notify(`Install failed to launch: ${(err as Error).message}`, "error");
				return;
			}
			if (result.code === 0) {
				ctx.ui.notify("Install succeeded. Re-run /searchful-check to verify.", "info");
			} else {
				ctx.ui.notify(
					`Install failed. Try manually: ${cmd}\nstderr: ${String(result.stderr).slice(0, 400)}`,
					"error",
				);
			}
		},
	});

	pi.registerCommand("searchful-login", {
		description: "Collect API keys for Exa/Brave/Tavily/Jina and store them in ~/.pi/agent/auth.json.",
		handler: async (_args, ctx) => {
			const ui = ctx.ui as unknown as { input?: (msg: string) => Promise<string> };
			const prompt = async (msg: string): Promise<string> => {
				if (typeof ui.input === "function") return ui.input(msg);
				// Fallback for modes without ui.input: rely on a one-shot notify.
				ctx.ui.notify(msg, "info");
				return "";
			};
			const result = await runLogin(prompt);
			const summary = result.written.length === 0
				? `No keys saved. Existing auth at ${result.path} untouched. Skipped: ${result.skipped.join(", ") || "none"}.`
				: `Saved keys for: ${result.written.join(", ")}. Merged into ${result.path}. Skipped: ${result.skipped.join(", ") || "none"}.`;
			ctx.ui.notify(summary, "info");
		},
	});
}

export type { Verbosity };
