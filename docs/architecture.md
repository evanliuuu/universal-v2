# Architecture

Universal v2 is a desktop UI driven by bounded JSON, not a growing HTML transcript.

```
(state, event) → reflex / compiled / prefetch / agent
               → JSON Patch → widget diff → sandboxed viewport
```

1. **State is external JSON.** The model sees the current document plus a short event window — never implied chat history.
2. **Emit deltas, not frames.** RFC 6902 patches update state and widgets. The viewport applies a small DOM patch list, or a full render when the patch budget is exceeded.
3. **Tiered execution.** Local reflex handles the obvious clicks. Compiled handlers live in `state.handlers`. The agent planner/executor only runs when those miss.
4. **Apps register themselves.** `defineApp({ open, reflex?, handlers? })` in `src/apps/` is enough — new apps should not need core runtime edits.

The host chrome (sidebar, health, Share) owns the session. The iframe at `public/viewport.html` is the only place widget HTML runs.

## Pipeline files

- Apps: `src/apps/`
- Reflex / compiled: `src/runtime/reflex.ts`, `src/runtime/compiled.ts`
- Agent: `src/agent/`
- Diff + viewport: `src/state/widget-diff.ts`, `src/runtime/viewport-bridge.ts`
- Sync: `src/sync/` (shared by the local server and the Cloudflare Durable Object)
