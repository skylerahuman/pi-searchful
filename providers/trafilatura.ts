/**
 * Trafilatura - URL extraction. https://trafilatura.datascienceaction.org/
 *
 *   trafilatura --url <url> --json --no-comments
 *
 * Single-page boilerplate-free text extraction. No API key; uses the
 * installed CLI: pip install trafilatura.
 */

import { spawn } from "node:child_process";
import { isUrlLike, type RetrieveAdapter, type SearchHit, type SearchOutput } from "../types";

export const trafilatura: RetrieveAdapter = {
	name: "trafilatura",
	async isReady(url) {
		return isUrlLike(url) && (await cliExists("trafilatura"));
	},
	async retrieve(url, verbosity, _ctx) {
		if (!isUrlLike(url)) throw new Error(`trafilatura: expected URL, got "${url}"`);
		// Trafilatura's CLI: --URL/-u (capital), NOT --url. 2.x rejects --url silently.
		const args = ["-u", url, "--json", "--no-comments"];
		const { stdout } = await run("trafilatura", args);
		const line = stdout.split("\n").find((l) => l.trim().startsWith("{")) ?? "{}";
		const obj = JSON.parse(line) as Record<string, unknown>;
		const title = stringField(obj, ["title", "sitename"]) ?? url;
		const body = stringField(obj, ["text", "plaintext", "body"]) ?? "";
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
				source: "trafilatura",
			},
		];
		return { hits };
	},
};

function stringField(o: Record<string, unknown>, names: string[]): string | undefined {
	for (const n of names) {
		const v = o[n];
		if (typeof v === "string" && v.trim().length > 0) return v;
	}
	return undefined;
}

function cliExists(bin: string): Promise<boolean> {
	return new Promise((resolve) => {
		const p = spawn(bin, ["--version"]);
		p.on("error", () => resolve(false));
		p.on("exit", (code) => resolve(code === 0));
	});
}

function run(bin: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number | null }> {
	return new Promise((resolve, reject) => {
		const p = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
		const out: Buffer[] = [];
		const err: Buffer[] = [];
		p.stdout.on("data", (c) => out.push(c));
		p.stderr.on("data", (c) => err.push(c));
		p.on("error", (e) => reject(e));
		p.on("exit", (code) =>
			resolve({ stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8"), code }),
		);
	});
}

function firstChars(s: string, n: number): string {
	const t = s.replace(/\s+/g, " ").trim();
	return t.length <= n ? t : t.slice(0, n - 1) + "\u2026";
}
