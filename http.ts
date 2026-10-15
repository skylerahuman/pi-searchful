/**
 * Tiny shared HTTP helper. Every provider adapter uses this so errors,
 * timeouts, and JSON parsing stay consistent.
 *
 * No SDK is pulled in: the providers we hit have small, stable REST shapes
 * and pulling each provider's SDK adds weight and version churn for no gain.
 */

import { config } from "./config";

export class HttpError extends Error {
	readonly status: number;
	readonly body: string;
	readonly url: string;
	constructor(message: string, status: number, body: string, url: string) {
		super(message);
		this.status = status;
		this.body = body;
		this.url = url;
	}
}

export interface FetchInit {
	method?: "GET" | "POST";
	url: string;
	headers?: Record<string, string>;
	body?: unknown;
	signal?: AbortSignal;
	timeoutMs?: number;
	/** When true, body is sent as a raw string instead of JSON.stringify. */
	rawBody?: boolean;
}

export async function fetchJson<T>(init: FetchInit): Promise<T> {
	const ctl = new AbortController();
	const timer = setTimeout(() => ctl.abort(), init.timeoutMs ?? config.httpTimeoutMs);
	const signal = init.signal
		? composeSignals(init.signal, ctl.signal)
		: ctl.signal;
	try {
		const res = await fetch(init.url, {
			method: init.method ?? "GET",
			headers: { "content-type": "application/json", ...(init.headers ?? {}) },
			body: init.body === undefined ? undefined : (init.rawBody ? String(init.body) : JSON.stringify(init.body)),
			signal,
		});
		const text = await res.text();
		if (!res.ok) {
			throw new HttpError(
				`HTTP ${res.status} ${res.statusText} for ${init.url}`,
				res.status,
				text.slice(0, 2000),
				init.url,
			);
		}
		if (!text.trim()) return {} as T;
		try {
			return JSON.parse(text) as T;
		} catch (err) {
			throw new HttpError(
				`Invalid JSON from ${init.url}: ${(err as Error).message}`,
				res.status,
				text.slice(0, 2000),
				init.url,
			);
		}
	} finally {
		clearTimeout(timer);
	}
}

/** fetch returns text directly without parsing as JSON. Used by Jina's s.jina.ai. */
export async function fetchText(init: FetchInit & { headers?: Record<string, string> }): Promise<string> {
	const ctl = new AbortController();
	const timer = setTimeout(() => ctl.abort(), init.timeoutMs ?? config.httpTimeoutMs);
	const signal = init.signal ? composeSignals(init.signal, ctl.signal) : ctl.signal;
	try {
		const res = await fetch(init.url, {
			method: init.method ?? "GET",
			headers: { ...(init.headers ?? {}) },
			body: init.body === undefined ? undefined : String(init.body),
			signal,
		});
		const text = await res.text();
		if (!res.ok) {
			throw new HttpError(
				`HTTP ${res.status} ${res.statusText} for ${init.url}`,
				res.status,
				text.slice(0, 2000),
				init.url,
			);
		}
		return text;
	} finally {
		clearTimeout(timer);
	}
}

function composeSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
	const ctl = new AbortController();
	const onA = () => ctl.abort(a.reason);
	const onB = () => ctl.abort(b.reason);
	a.addEventListener("abort", onA, { once: true });
	b.addEventListener("abort", onB, { once: true });
	if (a.aborted) ctl.abort(a.reason);
	if (b.aborted) ctl.abort(b.reason);
	return ctl.signal;
}
