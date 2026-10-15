/**
 * Output truncation with temp-file fallback, mirroring the rg example.
 *
 * - 50 KB / 2000 lines, whichever is hit first
 * - when truncated, the full text is written to a temp file and the caller
 *   learns about it via TruncationResult.fullOutputPath
 *
 * We deliberately do NOT re-export the upstream DEFAULT_MAX_* constants
 * because the rg example mutates them only to know the value to print in
 * the tool description; we keep our own copy so this module has no internal
 * dependency on Pi internals beyond `withFileMutationQueue`.
 */

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";

export const MAX_BYTES = 50_000;
export const MAX_LINES = 2000;

export function formatSize(n: number): string {
	if (n < 1024) return `${n}B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
	return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

export interface TruncationResult {
	content: string;
	truncated: boolean;
	outputBytes: number;
	outputLines: number;
	totalBytes: number;
	totalLines: number;
	fullOutputPath?: string;
}

export interface TruncateOptions {
	maxBytes?: number;
	maxLines?: number;
	/** When set, the full text is also written to a temp file regardless. */
	alwaysWriteTemp?: boolean;
}

/** truncateHead keeps the first N lines/bytes - good for search hits. */
export async function truncateHead(text: string, opts: TruncateOptions = {}): Promise<TruncationResult> {
	const maxBytes = opts.maxBytes ?? MAX_BYTES;
	const maxLines = opts.maxLines ?? MAX_LINES;
	const totalBytes = Buffer.byteLength(text, "utf8");
	const totalLines = text.length === 0 ? 0 : text.split("\n").length;

	let content = text;
	let truncated = false;

	// Trim bytes first (UTF-8 safe approx: count code units, cut at maxBytes).
	if (content.length > maxBytes) {
		content = content.slice(0, maxBytes);
		truncated = true;
	}
	// Then lines.
	const lines = content.split("\n");
	if (lines.length > maxLines) {
		content = lines.slice(0, maxLines).join("\n");
		truncated = true;
	}

	let fullOutputPath: string | undefined;
	if (truncated || opts.alwaysWriteTemp) {
		const dir = await mkdtemp(join(tmpdir(), "pi-search-"));
		const file = join(dir, "output.txt");
		await withFileMutationQueue(file, async () => {
			await writeFile(file, text, "utf8");
		});
		fullOutputPath = file;
	}

	return {
		content,
		truncated,
		outputBytes: Buffer.byteLength(content, "utf8"),
		outputLines: content.length === 0 ? 0 : content.split("\n").length,
		totalBytes,
		totalLines,
		fullOutputPath,
	};
}
