# Universal v2

Rewrite of [snickell/universal](https://github.com/snickell/universal).

An AI drives a little desktop UI through JSON state + patches instead of dumping HTML into the chat.

```text
event → reflex / compiled / agent → JSON Patch → sandboxed viewport
```

## Run

```bash
npm install
npm run dev       # http://localhost:5174
npm run server    # optional, :8787
npm run eval
```

Copy `.env.example` → `.env` if you want OpenRouter or websocket sync.

## What's in here

Demo apps: calendar, notes, settings (themes, token budget, prefetch).

Agent path is planner → executor. With an OpenRouter key it can plan and emit patches for opening apps / changing theme; otherwise it falls back to local templates.

Sessions persist in IndexedDB (replay + export/import). Optional Node server syncs over websocket + SQLite.

## Notes

- Widgets live under `src/widgets/`
- Apps register via `src/apps/`
- Eval sequences are in `eval/sequences/`
