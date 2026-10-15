/**
 * Tests for the auth.json merge logic in auth.ts.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readAuthFile, writeAuthFile, SEARCHFUL_PROVIDERS, type AuthFile } from "../auth.ts";

describe("auth.ts SEARCHFUL_PROVIDERS manifest", () => {
	it("contains the expected providers in stable order", () => {
		const ids = SEARCHFUL_PROVIDERS.map((p) => p.id);
		assert.deepEqual(ids, ["exa", "brave", "tavily", "jina"]);
	});

	it("each provider has an envVar derived from its id", () => {
		for (const p of SEARCHFUL_PROVIDERS) {
			const expected = p.id.toUpperCase().replace(/-/g, "_") + "_API_KEY";
			assert.equal(p.envVar, expected);
		}
	});
});

describe("auth.ts merge semantics", () => {
	it("preserves existing entries not in the new entries", () => {
		const tmp = mkdtempSync(join(tmpdir(), "auth-test-"));
		const path = join(tmp, "auth.json");
		try {
			// Seed file with two unrelated providers (OpenAI OAuth + minimax api_key)
			// plus an existing exa entry we expect to be overwritten.
			const seed: AuthFile = {
				openai: { type: "api_key", key: "openai-key" },
				minimax: { type: "api_key", key: "minimax-key" },
				exa: { type: "api_key", key: "old-exa" },
			};
			writeFileSync(path, JSON.stringify(seed, null, 2), "utf8");

			const result = writeAuthFile(
				{ exa: { type: "api_key", key: "new-exa" } },
				path,
			);

			// OpenAI and minimax preserved; exa overwritten.
			assert.equal(result.openai?.key, "openai-key");
			assert.equal(result.minimax?.key, "minimax-key");
			assert.equal(result.exa?.key, "new-exa");

			// Re-read and confirm
			const onDisk = JSON.parse(readFileSync(path, "utf8")) as AuthFile;
			assert.equal(onDisk.openai?.key, "openai-key");
			assert.equal(onDisk.minimax?.key, "minimax-key");
			assert.equal(onDisk.exa?.key, "new-exa");
		} finally {
			rmSync(tmp, { recursive: true });
		}
	});

	it("merges into an empty file", () => {
		const tmp = mkdtempSync(join(tmpdir(), "auth-test-"));
		const path = join(tmp, "auth.json");
		try {
			writeAuthFile(
				{ brave: { type: "api_key", key: "brave-new" } },
				path,
			);
			const onDisk = JSON.parse(readFileSync(path, "utf8")) as AuthFile;
			assert.equal(onDisk.brave?.key, "brave-new");
		} finally {
			rmSync(tmp, { recursive: true });
		}
	});

	it("readAuthFile returns {} when file is missing", () => {
		const tmp = mkdtempSync(join(tmpdir(), "auth-test-"));
		const path = join(tmp, "does-not-exist.json");
		const out = readAuthFile(path);
		assert.deepEqual(out, {});
	});

	it("readAuthFile returns {} on malformed JSON", () => {
		const tmp = mkdtempSync(join(tmpdir(), "auth-test-"));
		const path = join(tmp, "auth.json");
		writeFileSync(path, "this is not json{", "utf8");
		const out = readAuthFile(path);
		assert.deepEqual(out, {});
	});
});
