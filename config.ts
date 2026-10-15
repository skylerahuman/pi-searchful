/**
 * Loads .env from this extension's directory and exposes typed config.
 * Inline parser: ~30 lines, no external deps.
 *
 * Source priority (later overrides earlier):
 *   1. Built-in defaults
 *   2. .env in this file's directory
 *   3. process.env (shell-exported keys, e.g. via /searchful-login)
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));

/** Resolves `.env` relative to this file. Tries `here`, then `here/..`.
 *  - bundled: this file is dist/config.js, repo root is `..`
 *  - dev-load: this file is config.ts in repo root */
function findEnv(filename: string): string | undefined {
	const candidates = [join(here, filename), join(here, "..", filename)];
	for (const c of candidates) {
		if (existsSync(c)) return c;
	}
	return undefined;
}

/** Minimal .env parser: KEY=value, # comments, optional quoting. */
function loadEnvLite(path: string): void {
	if (!path) return;
	let text: string;
	try {
		text = readFileSync(path, "utf8");
	} catch {
		return;
	}
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const eq = line.indexOf("=");
		if (eq <= 0) continue;
		const key = line.slice(0, eq).trim();
		let val = line.slice(eq + 1).trim();
		if (
			(val.startsWith('"') && val.endsWith('"')) ||
			(val.startsWith("'") && val.endsWith("'"))
		) {
			val = val.slice(1, -1);
		}
		// Don't overwrite real env - process.env wins
		if (!(key in process.env)) process.env[key] = val;
	}
}

loadEnvLite(findEnv(".env") ?? "");
loadEnvLite(findEnv(".env.local") ?? "");

/** Repo root, for use by /search-install-deps. */
export const repoDir = existsSync(join(here, "package.json"))
	? here
	: join(here, "..");

function read(name: string): string | undefined {
	const v = process.env[name];
	if (!v) return undefined;
	const t = v.trim();
	return t.length === 0 ? undefined : t;
}

export const config = {
	exa: read("EXA_API_KEY"),
	brave: read("BRAVE_API_KEY"),
	tavily: read("TAVILY_API_KEY"),
	jina: read("JINA_API_KEY"),
	crawl4aiBaseUrl: read("CRAWL4AI_BASE_URL") ?? "http://localhost:11235",
	crawl4aiApiKey: read("CRAWL4AI_API_KEY"),
	defaultVerbosity: (read("SEARCH_DEFAULT_VERBOSITY") as "concise" | "normal" | "detailed" | undefined) ?? "normal",
	defaultMaxResults: Number(read("SEARCH_DEFAULT_MAX_RESULTS") ?? "5"),
	httpTimeoutMs: Number(read("SEARCH_HTTP_TIMEOUT_MS") ?? "15000"),
} as const;

/** Read the API key for a provider. Returns undefined if missing. */
export function keyFor(provider: string): string | undefined {
	switch (provider) {
		case "exa":
			return config.exa;
		case "brave":
			return config.brave;
		case "tavily":
			return config.tavily;
		case "jina":
			return config.jina;
		case "crawl4ai":
			return config.crawl4aiApiKey;
		default:
			return undefined;
	}
}
