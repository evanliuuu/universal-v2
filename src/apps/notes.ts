import { JsonPatchOp } from "../protocol/types";
import { defineApp } from "./registry";

export function notesWindowPatches(): {
  statePatch: JsonPatchOp[];
  uiPatch: JsonPatchOp[];
} {
  const winId = "win-notes";
  const rootId = "notes-root";
  const statePatch: JsonPatchOp[] = [
    {
      op: "add",
      path: `/windows/${winId}`,
      value: {
        id: winId,
        title: "Notes",
        x: 200,
        y: 120,
        width: 420,
        height: 320,
        rootId,
        minimized: false,
      },
    },
    {
      op: "add",
      path: `/widgets/${rootId}`,
      value: {
        id: rootId,
        type: "window",
        props: { title: "Notes", windowId: winId },
        children: ["notes-input"],
      },
    },
    {
      op: "add",
      path: "/widgets/notes-input",
      value: {
        id: "notes-input",
        type: "input",
        props: {
          placeholder: "Type a note…",
          value: "",
          multiline: true,
        },
        behavior: "local",
      },
    },
    {
      op: "add",
      path: "/widgets/desktop/children/-",
      value: rootId,
    },
    {
      op: "replace",
      path: "/focus",
      value: { windowId: winId, widgetId: "dock-notes" },
    },
    {
      op: "add",
      path: "/apps/notes",
      value: { open: true, body: "" },
    },
    {
      op: "add",
      path: "/handlers/focus-notes",
      value: {
        match: { type: "click", targetId: "dock-notes" },
        when: "!!state.windows['win-notes']",
        statePatch: [
          {
            op: "replace",
            path: "/focus",
            value: { windowId: winId, widgetId: "dock-notes" },
          },
        ],
        uiPatch: [],
      },
    },
  ];
  const uiPatch = statePatch.filter((op) => op.path.startsWith("/widgets"));
  return { statePatch, uiPatch };
}

defineApp({
  id: "notes",
  title: "Notes",
  dockId: "dock-notes",
  windowId: "win-notes",
  dockLabel: "🗒️",
  dockTitle: "Notes",
  aliases: ["note"],
  open: () => notesWindowPatches(),
});
