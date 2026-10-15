# pi-searchful

Two-tool web search and URL extraction for [Pi](https://github.com/earendil-works/pi):

- **`search(query, max_results, verbosity)`** — general-web search. Routed by the in-process **Jev classifier** to Exa (semantic), Brave (news/breadth), or Tavily (research). Non-URL inputs only.
- **`retrieve(url, verbosity, backend)`** — extract clean content from a known URL. Default chain `local, fast → cloud → local, slow` (Trafilatura → Jina → crawl4ai). Escalation happens *inside the tool* on real failures (process error, network error, JSON parse error, or empty body) — not on whether the content is "good enough." The model decides whether content is sufficient.

TUI shows status lines live during `retrieve()`:

```
attempting: local, fast           # Trafilatura started
attempting: local, fast → cloud   # escalated to Jina
results: local, fast → cloud      # Jina produced content
```

## Install

```bash
pi install git@github.com:skylerahuman/pi-searchful.git
```

Then in Pi:

```
/searchful-login          # collect Exa/Brave/Tavily/Jina API keys into auth.json
/searchful-check          # see readiness report
```

That's all. The extension also reads `.env` if present (lower-priority than auth.json):

| Var | Purpose |
|---|---|
| `EXA_API_KEY` | Exa |
| `BRAVE_API_KEY` | Brave |
| `TAVILY_API_KEY` | Tavily |
| `JINA_API_KEY` | Jina Reader |
| `CRAWL4AI_BASE_URL` | default `http://localhost:11235` |
| `SEARCH_DEFAULT_VERBOSITY` | `concise` / `normal` / `detailed` |
| `SEARCH_DEFAULT_MAX_RESULTS` | default 5 |

## Commands

- `/searchful-check` — readiness (classifier + keys + CLIs)
- `/searchful-install-deps` — best-effort `pip install crawl4ai`
- `/searchful-login` — prompt for keys, merge into `~/.pi/agent/auth.json`

## Configuration

`searchful` writes API keys via `/searchful-login` to `~/.pi/agent/auth.json`. The file merge preserves any unrelated provider auth (OpenAI, OpenAI Codex, etc.). For manual config, the shape per provider is:

```json
{
	"exa":   { "type": "api_key", "key": "..." },
	"brave": { "type": "api_key", "key": "..." },
	"tavily":{ "type": "api_key", "key": "..." },
	"jina":  { "type": "api_key", "key": "..." }
}
```

## Routing

`search()` asks Jev (in-process `typesafe/jev-latest`) one question: which of `exa / brave / tavily` is best for this query?

- **exa** — semantic similarity recall, concept-level discovery
- **brave** — index-level breadth, news and current events
- **tavily** — research-grade, AI-extracted answers + citations

Heuristic fallback when Jev unavailable: `news/today/latest` → brave, `research/study/paper/cite/review` → tavily, otherwise → exa.

`retrieve(backend: "auto")` chain (first ready wins, escalating only on real failure):

1. **Trafilatura** (`local, fast`) — local CLI, no key
2. **Jina Reader** (`cloud`) — hosted, multi-URL, requires `JINA_API_KEY`
3. **crawl4ai** (`local, slow`) — optional, requires server

Explicit `backend` (`"trafilatura" | "jina" | "crawl4ai"`) runs that backend only — no escalation.

## Development

Source layout (post-0.2.0 flatten):

```
.
├── package.json          # pi-searchful@0.2.0, peer-deps Pi modules
├── tsconfig.json         # editor typecheck
├── tsconfig.build.json   # emits dist/
├── index.ts              # extension entrypoint (top-level for jiti)
├── auth.ts               # /searchful-login implementation
├── classifier.ts         # Jev wrapper + heuristic fallback
├── config.ts             # inline .env parser (~30 lines)
├── http.ts               # shared fetch wrapper
├── preflight.ts          # readiness + classifier probe
├── render.ts             # shared tool renderers
├── router.ts             # search/retrieve dispatch
├── truncate.ts           # 50KB/2000-line cap with temp-file fallback
├── types.ts              # shared types and constants
├── providers/            # one file per backend
└── ...
```

```
npm install        # installs dev deps; peer deps come from Pi
npm run check      # tsc --noEmit
npm run build      # tsc -p tsconfig.build.json -> dist/
```

## Status

| Layer | Status |
|---|---|
| search() — Exa / Brave / Tavily | ✅ live |
| search() — OpenAI synthesis | stubbed-only; not registered; tracked for v0.3 |
| retrieve() — Trafilatura / Jina / crawl4ai | ✅ live |
| Jev routing (`typesafe/jev-latest`) | ✅ live |
| Heuristic fallback | ✅ live |
| /searchful-login (writes to `~/.pi/agent/auth.json`) | ✅ live |
| /searchful-check | ✅ live |
| /searchful-install-deps | ✅ live |

## Security

`.env` is in `.gitignore`. `auth.json` is plain JSON by Pi convention — keep filesystem permissions tight. The extension does not log keys.

## License

ISC (placeholder; revise before publishing).
