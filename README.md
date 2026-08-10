# Universal v2 — Day 2 prototype

A rewrite of [snickell/universal](https://github.com/snickell/universal) using the 2026 architecture:

```text
(state, event) → reflex | compiled | prefetch | agent(fast|big) → patches
```

State is an external JSON document. The runtime emits RFC 6902 JSON Patch deltas (AG-UI style). The browser renders a widget tree in a **sandboxed iframe**.

## Quick start

```bash
cd universal-v2
npm install
npm run dev
```

Open http://localhost:5174

### Try it

| Action | Tier |
|---|---|
| Click **📅** / **🗒️** (first time) | `agent-big` — opens app |
| Click dock again (app open) | `compiled` — focus handler |
| After first open, click other dock icon quickly | `prefetch` — may hit cache |
| Type in Notes, calendar nav | `reflex` — instant, no model |
| Instruction box ("open calendar") | `agent-big` |

Sessions **resume from IndexedDB** on reload. Event log is append-only; state snapshots every 5 events.

## Eval harness

```bash
npm run eval
```

Runs `eval/sequences/*.json` — open-calendar, open-notes, focus-calendar-compiled.

## OpenRouter (optional)

```bash
cp .env.example .env
```

```env
VITE_OPENROUTER_API_KEY=...
VITE_OPENROUTER_FAST_MODEL=google/gemini-2.5-flash
VITE_OPENROUTER_BIG_MODEL=anthropic/claude-sonnet-4
```

## Layout

```text
universal-v2/
  src/
    protocol/       # types, AG-UI wire messages
    state/          # patch applier, seed, store
    persistence/    # IndexedDB event log + snapshots
    widgets/        # 5 widgets + renderer
    runtime/        # reflex, compiled, dispatch loop
    agent/          # router (fast/big), prefetch, mock/OpenRouter
  eval/
    sequences/
```

## Day 2 additions

- **Event-sourced persistence** — IndexedDB append-only log + keyframe snapshots
- **Per-event model routing** — fast vs big tier by event class
- **Speculative prefetch** — background cache for dock clicks
- **Compiled handler tier** — `state.handlers` for JIT focus/patch paths
- **AG-UI wire messages** — `STATE_SNAPSHOT`, `STATE_DELTA`, `UI_DELTA`, etc.

## Still out of scope (Day 3+)

- WebSocket / Cloudflare Durable Objects / Drizzle server persistence
- Full AG-UI transport over WebSocket
- Token budget policies per session

## Core architecture

1. **Bounded context** — agent receives current `state` + one `event`
2. **Delta output** — JSON Patch, not HTML frames
3. **Tiered execution** — reflex → compiled → prefetch → agent
4. **Sandboxed viewport** — untrusted UI in isolated iframe
