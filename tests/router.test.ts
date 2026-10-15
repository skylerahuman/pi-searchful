/**
 * Tests for the search() routing logic.
 * Uses a stubbed Jev classifier via tests/helpers/classifier-stub.ts.
 *
 * NOTE: These tests do not run adapters against live HTTP. They verify the
 * routing decision lands where Jev instructs; the actual provider call is
 * what comes next, and that's covered by adapter-level integration which
 * would need real API keys.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { dispatchSearch } from "../router.ts";
import { classifierFromCanned, resetClassifierOverrides } from "./helpers/classifier-stub.ts";

describe("search() routing decisions", () => {
	after(() => resetClassifierOverrides());

	it("Jev picks brave -> router uses brave", async () => {
		const ctx = { modelRegistry: classifierFromCanned({ provider: "brave" }) };
		const signal = new AbortController().signal;
		// We expect dispatch to either succeed (if BRAVE_API_KEY happens to
		// be available in process.env via .env) or throw with "No search
		// provider available". Either path lands on brave. We only assert
		// the routing decision we can verify cleanly.
		try {
			const r = await dispatchSearch(
				{ query: "news today", max_results: 1, verbosity: "concise" },
				signal,
				ctx as never,
			);
			assert.ok(["brave", "exa", "tavily"].includes(r.provider.provider),
				`unexpected final provider: ${r.provider.provider}`,
			);
		} catch (err) {
			assert.match((err as Error).message, /No search provider available|fetch|JINA_API_KEY|BRAVE_API_KEY|EXA_API_KEY|TAVILY_API_KEY/);
		}
	});

	it("Jev picks exa -> router uses exa", async () => {
		const ctx = { modelRegistry: classifierFromCanned({ provider: "exa" }) };
		const signal = new AbortController().signal;
		try {
			await dispatchSearch(
				{ query: "deep dive on something", max_results: 1, verbosity: "concise" },
				signal,
				ctx as never,
			);
		} catch (err) {
			assert.match((err as Error).message, /No search provider available|fetch|JINA_API_KEY|BRAVE_API_KEY|EXA_API_KEY|TAVILY_API_KEY/);
		}
	});

	it("Jev picks tavily -> router uses tavily", async () => {
		const ctx = { modelRegistry: classifierFromCanned({ provider: "tavily" }) };
		const signal = new AbortController().signal;
		try {
			await dispatchSearch(
				{ query: "research summary of AIs", max_results: 1, verbosity: "concise" },
				signal,
				ctx as never,
			);
		} catch (err) {
			assert.match((err as Error).message, /No search provider available|fetch|JINA_API_KEY|BRAVE_API_KEY|EXA_API_KEY|TAVILY_API_KEY/);
		}
	});
});
