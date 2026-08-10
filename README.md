# Universal v2

A rewrite of [snickell/universal](https://github.com/snickell/universal) — `(state, event) → patches → incremental render`.

## Quick start

```bash
cd universal-v2
npm install
npm run dev          # client http://localhost:5174
npm run server       # optional ws server :8787
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
| Planner / executor split | ✅ Day 4 |
| Incremental DOM patches | ✅ |
| Token budget + prefetch policy | ✅ |
| Session replay | ✅ |
| Widget toolkit (10 types) | ✅ |
| WebSocket + SQLite server | ✅ Day 4 |
| Eval CI (10 sequences) | ✅ |

## Widgets

`box` · `text` · `label` · `button` · `input` · `list` · `tabs` · `table` · `form` · `window`

## Apps (demo)

- **Calendar** — month nav (reflex)
- **Notes** — live typing (reflex)
- **Settings** — tabs, theme buttons, budget table

## NL instructions (mock planner)

- `open calendar` / `open notes` / `open settings`
- `switch to dark theme` / `win95 theme`
- `double the token budget`

## Eval

```bash
npm run eval   # 10 sequences
```

CI: `.github/workflows/universal-v2-eval.yml`

## Layout

```text
universal-v2/
  public/viewport.html
  server/           # WebSocket + Drizzle SQLite
  src/
    agent/          # planner, executor, router, budget, prefetch
    transport/      # ws-sync client
    runtime/        # loop, reflex, compiled, replay, viewport-bridge
    state/          # patch, safe-patch, widget-diff, seed
    widgets/
  eval/sequences/
```

## Roadmap

- Cloudflare Durable Objects deployment
- 20+ widgets, theme packs
- Planner model separate from executor (live LLM)
- Drift detection + STATE_SNAPSHOT on mismatch
