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

Deployed Worker (no local Node required):

- API: `https://universal-v2.evanliuuu.workers.dev`
- WS: `wss://universal-v2.evanliuuu.workers.dev/ws`

```bash
cd cloud && npm install
npm run cloud:deploy   # wrangler deploy
# point .env at the workers.dev URLs (see .env.example), then npm run dev
```

1. Open the app, click **Share** (creates a tokenized session).
2. Open the copied `?session=&token=` URL in a second browser / profile.
3. Both clients sync over `wss://` via a Durable Object.

Prove without UI:

```bash
npm run smoke:sync -- https://universal-v2.evanliuuu.workers.dev
# or locally: npm run cloud:dev && npm run smoke:sync
```

Free-plan Durable Objects use a SQLite-backed migration (`new_sqlite_classes` in `cloud/wrangler.toml`).

Conflict policy is seq-ordered: deltas must be `serverSeq + 1`; snapshots catch up when `seq >= serverSeq`. Bad tokens are rejected.

## Notes

- Widgets live under `src/widgets/`
- Apps register via `defineApp({ open, reflex?, handlers? })` in `src/apps/` — new apps shouldn't need core runtime edits
- Themes include cupertino, dark, win95, material, high-contrast, and custom CSS vars (`meta.themeVars`)
- Sync core: `src/sync/` (conflict + session room) shared by local server and Cloudflare DO
- Session health in the sidebar: token bar, latency histogram, retry on budget/patch/sync failures
- Debug toggle shows the event log and raw state JSON; both stay hidden by default
- Keyboard: Tab through dock/windows, Enter to activate, Escape to close; widgets expose ARIA roles
- Drag a titlebar to move a window; click a window to bring it in front
- Narrow layout (≤640px desktop / ≤800px chrome): dock wraps, windows stack, resize handles hide
- Long lists virtualize (Files has 60+ rows; the viewport keeps a 12-row window)
- Docs: `docs/architecture.md`, `docs/widget-catalog.md`, `docs/build-an-app.md` — also the 📘 Docs dock app
- Eval sequences are in `eval/sequences/`
- `npm run endurance` — 200+ events, p95 budget, recover from a token-limit miss
