# Build an app

1. Create `src/apps/hello.ts` and register it from `src/apps/index.ts`.
2. Use `defineApp`:

```ts
defineApp({
  id: "hello",
  title: "Hello",
  dockId: "dock-hello",
  windowId: "win-hello",
  dockLabel: "👋",
  aliases: ["hi"],
  open: () => helloWindowPatches(),
  reflex: (doc, event) => {
    if (event.type !== "click" || event.targetId !== "hello-btn") return null;
    return { handled: true, statePatch: [...], uiPatch: [...] };
  },
});
```

3. `open` returns JSON Patch ops that add a window, widgets, focus, and a focus handler.
4. `reflex` is optional — keep local clicks out of the agent.
5. Add an eval sequence in `eval/sequences/` that opens the dock icon and asserts a path.
6. Dock icons are generated from `listApps()` — no seed file edits.

The Docs dock app is itself registered this way. See `src/apps/docs.ts`.
