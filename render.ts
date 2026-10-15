/**
 * Shared renderers for both search() and retrieve().
 */

import { Text, type Component } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { SearchDetails, RetrieveDetails } from "./types";

export function renderCall(
	args: { query: string; max_results: number; verbosity: string },
	theme: Theme,
): Component {
	const q = theme.fg("accent", `"${args.query}"`);
	const n = theme.fg("muted", `x${args.max_results}`);
	const v = theme.fg("dim", `[${args.verbosity}]`);
	return new Text(theme.fg("toolTitle", theme.bold("search ")) + q + " " + n + " " + v, 0, 0);
}

export function renderResult(
	result: { content: ReadonlyArray<{ type: string; text?: string }>; details?: unknown },
	opts: { expanded: boolean; isPartial: boolean },
	theme: Theme,
): Component {
	const details = (result.details ?? undefined) as SearchDetails | undefined;
	if (opts.isPartial) return new Text(theme.fg("warning", "searching..."), 0, 0);
	if (!details) {
		const c = result.content[0];
		return new Text(c?.type === "text" ? c.text ?? "" : "", 0, 0);
	}
	if (details.error) {
		return new Text(theme.fg("error", `search error: ${details.error}`), 0, 0);
	}
	let head = theme.fg("success", `${details.hitCount} hit(s)`) + theme.fg("muted", ` via ${details.provider}`);
	if (details.truncated) head += theme.fg("warning", " (truncated)");
	if (opts.expanded) {
		const c = result.content[0];
		if (c?.type === "text" && c.text) {
			const lines = c.text.split("\n").slice(0, 20);
			for (const line of lines) head += `\n${theme.fg("dim", line)}`;
			if (c.text.split("\n").length > 20) head += `\n${theme.fg("muted", "... (use read tool for full output)")}`;
		}
		if (details.fullOutputPath) {
			head += `\n${theme.fg("dim", `Full output: ${details.fullOutputPath}`)}`;
		}
	}
	return new Text(head, 0, 0);
}

export function renderRetrieveCall(
	args: { url: string; verbosity: string; backend?: string },
	theme: Theme,
): Component {
	const u = theme.fg("accent", `"${args.url}"`);
	const v = theme.fg("dim", `[${args.verbosity}]`);
	return new Text(theme.fg("warning", theme.bold("retrieve ")) + u + " " + v, 0, 0);
}

export function renderRetrieveResult(
	result: { content: ReadonlyArray<{ type: string; text?: string }>; details?: unknown },
	opts: { expanded: boolean; isPartial: boolean },
	theme: Theme,
): Component {
	const details = (result.details ?? undefined) as RetrieveDetails | undefined;
	if (opts.isPartial) {
		// Partial = still in flight. Live chain comes via onUpdate partial results.
		const liveChain = details?.attemptChain ?? [];
		const live = liveChain.length > 0
			? `attempting: ${liveChain.join(" \u2192 ")}`
			: "extracting...";
		return new Text(theme.fg("warning", live), 0, 0);
	}
	if (!details) {
		const c = result.content[0];
		return new Text(c?.type === "text" ? c.text ?? "" : "", 0, 0);
	}
	if (details.error) {
		const chain = details.attemptChain.length ? details.attemptChain.join(" \u2192 ") : "(none)";
		return new Text(theme.fg("error", `results: ${chain} (all failed)`), 0, 0);
	}
	const chain = details.attemptChain.length > 0
		? `results: ${details.attemptChain.join(" \u2192 ")}`
		: `results: ${details.attemptChain[0] ?? "unknown"}`;
	let head = theme.fg("success", chain);
	if (details.truncated) head += theme.fg("warning", " (truncated)");
	if (opts.expanded) {
		const c = result.content[0];
		if (c?.type === "text" && c.text) {
			const lines = c.text.split("\n").slice(0, 30);
			for (const line of lines) head += `\n${theme.fg("dim", line)}`;
		}
		if (details.fullOutputPath) {
			head += `\n${theme.fg("dim", `Full output: ${details.fullOutputPath}`)}`;
		}
	}
	return new Text(head, 0, 0);
}
