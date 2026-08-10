# Universal v2

A rewrite of [snickell/universal](https://github.com/snickell/universal) using the 2026 architecture:

```text
(state, event) → reflex | compiled | prefetch | agent(fast|big) → patches → incremental render
```

## Quick start

```bash
cd universal-v2
npm install
npm run dev
```

Open http://localhost:5174

## Architecture

| Layer | What it does |
|---|---|
| **State** | External JSON document (never HTML in context) |
| **Patches** | RFC 6902 deltas, validated before apply |
| **Tiers** | reflex → compiled → prefetch → agent-fast/big |
| **Render** | Persistent iframe + widget-level DOM patches |
| **Persistence** | IndexedDB event log + keyframe snapshots |
| **Replay** | Re-apply event log without model calls |

## Try it

1. Click **📅** — opens Calendar (`agent-big`)
2. Click **📅** again — focus via `compiled` handler
3. Type in Notes — `reflex` (incremental DOM update, focus preserved)
4. Click **Replay** — replays IndexedDB event log
5. Watch token budget in the stats bar

## Eval

```bash
npm run eval
```

Six sequences in `eval/sequences/` covering reflex, compiled, agent, and close-window flows.

## OpenRouter

```bash
cp .env.example .env
```

## Project layout

```text
universal-v2/
  public/viewport.html       # persistent sandbox iframe boot page
  src/
    protocol/                # types + AG-UI messages
    state/                   # patch, diff, safe-patch, seed
    persistence/             # IndexedDB
    widgets/                 # box, text, label, button, input, list, window
    runtime/                 # loop, reflex, compiled, replay, viewport-bridge
    agent/                   # router, prefetch, budget, mock/OpenRouter
  eval/
```

## Roadmap status

| Milestone | Status |
|---|---|
| Architecture proof | ✅ |
| Tiered execution | ✅ |
| Client persistence | ✅ |
| Incremental render | ✅ Day 3 |
| Token budget | ✅ Day 3 |
| Session replay | ✅ Day 3 |
| Server (DO/WebSocket/Drizzle) | 🔜 |
| 20+ widget toolkit | 🔜 |
