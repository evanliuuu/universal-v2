# Universal v2

I found [snickell/universal](https://github.com/snickell/universal) program pretty interesting, and decided to do a rewrite.

An AI drives a little desktop UI through JSON state + patches instead of dumping HTML into the chat.

```text
event → reflex / compiled / agent → JSON Patch → sandboxed viewport
```

## Run

```bash
npm install
npm run dev       # http://localhost:5174
npm run server    # optional local sync, :8787
npm run eval
```

Copy `.env.example` → `.env` if you want OpenRouter or websocket sync.

### Cloud sync (Phase 8)

```bash
cd cloud && npm install
npm run cloud:dev      # wrangler durable object on :8787-ish
# or
npm run cloud:deploy   # then point VITE_WS_URL / VITE_SYNC_API_URL at the worker
```

1. Open the app, click **Share** (creates a tokenized session).
2. Open the copied `?session=&token=` URL in a second browser.
3. Both clients sync over `wss://` via a Durable Object — no local Node server required after deploy.

Prove locally without UI:

```bash
npm run cloud:dev          # wrangler DO on :8787
npm run smoke:sync         # two WS clients + conflict checks
```

Conflict policy is seq-ordered: deltas must be `serverSeq + 1`; snapshots catch up when `seq >= serverSeq`. Bad tokens are rejected.

## Notes

- Widgets live under `src/widgets/`
- Apps register via `defineApp({ open, reflex?, handlers? })` in `src/apps/` — new apps shouldn't need core runtime edits
- Themes include cupertino, dark, win95, material, high-contrast, and custom CSS vars (`meta.themeVars`)
- Sync core: `src/sync/` (conflict + session room) shared by local server and Cloudflare DO
- Eval sequences are in `eval/sequences/`
