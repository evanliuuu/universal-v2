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
npm run server    # optional, :8787
npm run eval
```

Copy `.env.example` → `.env` if you want OpenRouter or websocket sync.

## Notes

- Widgets live under `src/widgets/`
- Apps register via `defineApp({ open, reflex?, handlers? })` in `src/apps/` — new apps shouldn't need core runtime edits
- Themes include cupertino, dark, win95, material, high-contrast, and custom CSS vars (`meta.themeVars`)
- Eval sequences are in `eval/sequences/`
