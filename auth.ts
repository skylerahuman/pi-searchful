/**
 * /searchful-login: collect API keys via Pi's UI and write them to
 * ~/.pi/agent/auth.json. Merges with existing entries so we never
 * overwrite unrelated provider auth (e.g. openai-codex OAuth).
 *
 * We deliberately don't try to "encrypt" — Pi's auth.json is plain JSON
 * readable by Pi's process. We just write the right shape.
 *
 * Schema per provider (matches Pi's auth.json convention):
 *   { type: "api_key", key: "<key>" }
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface AuthEntry {
	type: "api_key";
	key: string;
}

export type AuthFile = Record<string, AuthEntry>;

export const SEARCHFUL_PROVIDERS = [
	{ id: "exa", name: "Exa (exa.ai)", envVar: "EXA_API_KEY", keyHint: "Get one at https://exa.ai" },
	{ id: "brave", name: "Brave Search (brave.com/search/api)", envVar: "BRAVE_API_KEY", keyHint: "Subscribe at https://brave.com/search/api" },
	{ id: "tavily", name: "Tavily (tavily.com)", envVar: "TAVILY_API_KEY", keyHint: "Get one at https://app.tavily.com" },
	{ id: "jina", name: "Jina Reader (jina.ai)", envVar: "JINA_API_KEY", keyHint: "Get one at https://jina.ai" },
] as const;

/** Path to Pi's auth.json. */
export function authJsonPath(): string {
	return join(homedir(), ".pi", "agent", "auth.json");
}

/** Read auth.json. Returns {} when missing. */
export function readAuthFile(): AuthFile {
	const p = authJsonPath();
	if (!existsSync(p)) return {};
	try {
		const text = readFileSync(p, "utf8");
		const parsed = JSON.parse(text) as unknown;
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return parsed as AuthFile;
		}
		return {};
	} catch {
		return {};
	}
}

/** Merge new entries into auth.json. Preserves all existing entries. */
export function writeAuthFile(entries: Record<string, AuthEntry>): AuthFile {
	const current = readAuthFile();
	const merged = { ...current, ...entries };
	const p = authJsonPath();
	writeFileSync(p, JSON.stringify(merged, null, "\t") + "\n", "utf8");
	return merged;
}

/** UI helper: a single key-prompt cycle. Returns "" on skip, the trimmed key on accept. */
export async function promptKey(
	prompt: (msg: string) => Promise<string>,
	providerName: string,
	keyHint: string,
): Promise<string> {
	const note = await prompt(`${providerName}\n  ${keyHint}\n  Press Enter with no input to skip.\n  Key: `);
	return note.trim();
}

/**
 * Onboarding: ask the user for each provider's API key (skip blank), merge
 * into auth.json. The `prompt` callback is supplied by the command handler
 * so callers can wire it to ctx.ui.input.
 */
export interface LoginResult {
	written: string[];
	skipped: string[];
	path: string;
}

export async function runLogin(prompt: (msg: string) => Promise<string>): Promise<LoginResult> {
	const entries: Record<string, AuthEntry> = {};
	const written: string[] = [];
	const skipped: string[] = [];

	for (const p of SEARCHFUL_PROVIDERS) {
		const key = await promptKey(prompt, p.name, p.keyHint);
		if (!key) {
			skipped.push(p.id);
			continue;
		}
		entries[p.id] = { type: "api_key", key };
		written.push(p.id);
	}

	if (written.length === 0) {
		return { written, skipped, path: authJsonPath() };
	}
	writeAuthFile(entries);
	return { written, skipped, path: authJsonPath() };
}
