# Universal v2

A rewrite of [snickell/universal](https://github.com/snickell/universal) — `(state, event) → patches → incremental render`.

## Quick start

```bash
cd universal-v2
npm install
npm run dev          # client http://localhost:5174
npm run server       # optional ws + REST server :8787
```

With server sync, copy `.env.example` → `.env` (sets `VITE_WS_URL=ws://localhost:5174/ws` proxied to `:8787`).

## Architecture

```text
Event → reflex | compiled | prefetch | planner→executor (fast/big)
      → validated JSON Patch → widget diff → sandboxed iframe
      → IndexedDB + optional WebSocket/Drizzle server
```

| Layer | Status |
|---|---|
| Tiered execution | ✅ |
| Planner / executor split | ✅ |
| Live OpenRouter planner (plan only) | ✅ Day 5 |
| Theme engine (cupertino / dark / win95) | ✅ Day 5 |
| Drift detection + full re-render | ✅ Day 5 |
| Session export / import | ✅ Day 5 |
| Incremental DOM patches | ✅ |
| Token budget + prefetch policy | ✅ |
| Session replay | ✅ |
| Widget toolkit (11 types) | ✅ |
| WebSocket + SQLite server | ✅ |
| Eval CI (13 sequences) | ✅ |

## Widgets

`box` · `text` · `label` · `button` · `input` · `list` · `tabs` · `table` · `form` · `checkbox` · `window`

## Apps (demo)

- **Calendar** — month nav (reflex)
- **Notes** — live typing (reflex)
- **Settings** — tabs, theme buttons, budget table, prefetch toggle

## NL instructions (mock planner)

- `open calendar` / `open notes` / `open settings`
- `switch to dark theme` / `win95 theme`
- `double the token budget`

OpenRouter mode uses a **live planner** (`planLive`) that returns structured plans; the **executor** still emits patches locally.

## Eval

```bash
npm run eval   # 13 sequences
```

CI: `.github/workflows/universal-v2-eval.yml`

## Server REST

- `GET /health` — liveness
- `GET /sessions` — list stored sessions
- `GET /sessions/:id/events` — event log for a session
- `WS /ws` — snapshot + event sync

## Layout

```text
universal-v2/
  public/viewport.html
  server/           # WebSocket + Drizzle SQLite + REST
  src/
    agent/          # planner, planner-live, executor, router, budget, prefetch
    themes/         # CSS variable theme packs
    transport/      # ws-sync client
    runtime/        # loop, reflex, compiled, replay, viewport-bridge
    state/          # patch, safe-patch, widget-diff, drift, seed
    persistence/    # event-log, export
    widgets/
  eval/sequences/
```

## Roadmap

- Cloudflare Durable Objects deployment
- 20+ widgets, more theme packs
- Live LLM executor (patches from model)
- Full AG-UI WebSocket transport
