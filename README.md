# Universal v2 — Day 1 prototype

A minimal rewrite of [snickell/universal](https://github.com/snickell/universal) using the 2026 architecture:

```text
(state, event) → (state patch, UI patch)
```

State is an external JSON document. The model (or mock agent) emits RFC 6902 JSON Patch deltas. The browser renders a widget tree in a **sandboxed iframe**. Micro-interactions run on the **reflex** tier without calling a model.

## Quick start

```bash
cd universal-v2
npm install
npm run dev
```

Open http://localhost:5174

- Click **📅** on the dock → agent opens Calendar (mock, no API key)
- Click day **15**, **◀/▶** month nav → reflex tier (instant, no model)
- Type in Notes → reflex tier updates `props.value`
- Watch the event log and state panel on the left

## Eval harness

```bash
npm run eval
```

Runs scripted interaction sequences against the mock agent + reflex reducers.

## OpenRouter (optional)

```bash
cp .env.example .env
# set VITE_OPENROUTER_API_KEY=...
```

Select **OpenRouter** in the UI agent dropdown.

## Layout

```text
universal-v2/
  src/
    protocol/     # Zod schemas, types
    state/        # patch applier, seed state, store
    widgets/      # 5 widgets: box, text, button, input, window
    runtime/      # renderer, reflex reducers, dispatch loop
    agent/        # mock + OpenRouter agent
  eval/
    sequences/    # scripted tests
```

## What's intentionally missing (Day 2+)

- WebSocket / Durable Objects / Drizzle persistence
- Event-sourced log to disk
- Speculative prefetch
- Per-event model routing (fast vs big)
- JIT-compiled handler tier
- Full AG-UI wire protocol

## Core bet verified here

1. **Bounded context** — agent receives current `state` + one `event`, not HTML history
2. **Delta output** — JSON Patch instead of full frames
3. **Reflex tier** — typing and calendar nav never touch the model
4. **Sandboxed viewport** — untrusted UI in `iframe[sandbox]`
