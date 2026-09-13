export const DOCS = {
  architecture: `# Architecture

Universal v2 is a desktop UI driven by bounded JSON, not a growing HTML transcript.

\`\`\`
(state, event) → reflex / compiled / prefetch / agent
               → JSON Patch → widget diff → sandboxed viewport
\`\`\`

1. **State is external JSON.** The model sees the current document plus a short event window — never implied chat history.
2. **Emit deltas, not frames.** RFC 6902 patches update state and widgets. The viewport applies a small DOM patch list, or a full render when the patch budget is exceeded.
3. **Tiered execution.** Local reflex handles the obvious clicks. Compiled handlers live in \`state.handlers\`. The agent planner/executor only runs when those miss.
4. **Apps register themselves.** \`defineApp({ open, reflex?, handlers? })\` in \`src/apps/\` is enough — new apps should not need core runtime edits.

The host chrome (sidebar, health, Share) owns the session. The iframe at \`public/viewport.html\` is the only place widget HTML runs.
`,
  widgets: `# Widget catalog

Every widget is a \`WidgetNode\`: \`{ id, type, props, children?, behavior? }\`.

| Type | Role | Typical props |
| --- | --- | --- |
| box | layout | layout, gap, align |
| text / label | copy | text |
| button | action | label, title |
| input | edit | value, multiline, placeholder |
| list | choose | items, selectedId — virtualized after 16 rows |
| tabs | switch | tabs, activeTab |
| table | grid | columns, rows |
| form | group | children |
| checkbox | toggle | checked, label |
| select | pick | options, value |
| slider | range | value, min, max |
| divider | rule | — |
| scroll-area | clip | maxHeight |
| menu | menu | items, open |
| dialog | modal | open, title |
| icon / image | media | glyph, src, alt |
| window | chrome | title, windowId |

Lists longer than 16 items render a 12-row window and scroll the rest. The viewport keeps the full item list in \`data-items\` so Arrow keys and clicks still address every row.
`,
  tutorial: `# Build an app

1. Create \`src/apps/hello.ts\` and register it from \`src/apps/index.ts\`.
2. Use \`defineApp\`:

\`\`\`ts
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
\`\`\`

3. \`open\` returns JSON Patch ops that add a window, widgets, focus, and a focus handler.
4. \`reflex\` is optional — keep local clicks out of the agent.
5. Add an eval sequence in \`eval/sequences/\` that opens the dock icon and asserts a path.
6. Dock icons are generated from \`listApps()\` — no seed file edits.

The Docs dock app you are reading is itself registered this way.
`,
} as const;

export type DocsTab = keyof typeof DOCS;
