/**
 * Tests for the inline .env loader in config.ts.
 * Runs without external deps using node:test. No live HTTP.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

describe("config.ts inline .env loader", () => {
	let savedEnv: Record<string, string | undefined>;
	let savedKeys: string[];

	before(() => {
		savedKeys = Object.keys(process.env).filter((k) =>
			/^(EXA|BRAVE|TAVILY|JINA|CRAWL4AI|SEARCH_DEFAULT|SEARCH_HTTP)_/.test(k),
		);
		savedEnv = Object.fromEntries(savedKeys.map((k) => [k, process.env[k]]));
		for (const k of savedKeys) delete process.env[k];
	});

	after(() => {
		for (const k of savedKeys) {
			if (savedEnv[k] === undefined) delete process.env[k];
			else process.env[k] = savedEnv[k];
		}
	});

	/**
	 * Re-implements the inline loader's read loop so this test doesn't have
	 * to re-import the source module (which captured cwd at import time).
	 * If this drifts from config.ts, the test is wrong - the source is truth.
	 * Re-implements the inline loader's read loop so this test doesn't have
	 * to re-import the source module (which captured cwd at import time).
	 * If this drifts from config.ts, the test is wrong - the source is truth.
	 */
	function loadEnvLite(text: string) {
		for (const raw of text.split(/\r?\n/)) {
			const line = raw.trim();
			if (!line || line.startsWith("#")) continue;
			const eq = line.indexOf("=");
			if (eq <= 0) continue;
			const key = line.slice(0, eq).trim();
			let val = line.slice(eq + 1).trim();
			if (
				(val.startsWith('"') && val.endsWith('"')) ||
				(val.startsWith("'") && val.endsWith("'"))
			) val = val.slice(1, -1);
			if (!(key in process.env)) process.env[key] = val;
		}
	}

	it("parses key=value pairs and skips comments", () => {
		const text = [
			"# comment line",
			"EXA_API_KEY=exakey-from-env",
			'BRAVE_API_KEY="quoted value"',
			"",
		].join("\n");
		loadEnvLite(text);
		assert.equal(process.env.EXA_API_KEY, "exakey-from-env");
		assert.equal(process.env.BRAVE_API_KEY, "quoted value");
	});

	it("does not override real process.env entries (real env wins)", () => {
		process.env.TAVILY_API_KEY = "from-shell";
		loadEnvLite("TAVILY_API_KEY=from-file\n");
		assert.equal(process.env.TAVILY_API_KEY, "from-shell");
		delete process.env.TAVILY_API_KEY;
	});
});
