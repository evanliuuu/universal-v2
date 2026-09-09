import { JsonPatchOp } from "../protocol/types";
import { defineApp } from "./registry";

const FILES: Record<string, string> = {
  readme: "# Universal v2\n\nA tiny desktop driven by JSON patches.",
  todo: "- [ ] add more widgets\n- [ ] cloud sync",
  meeting: "Standup notes\n\nShipped the app registry.",
};

export function filesWindowPatches(): {
  statePatch: JsonPatchOp[];
  uiPatch: JsonPatchOp[];
} {
  const winId = "win-files";
  const rootId = "files-root";
  const items = [
    { id: "readme", label: "readme.md" },
    { id: "todo", label: "todo.txt" },
    { id: "meeting", label: "meeting.txt" },
  ];
  const statePatch: JsonPatchOp[] = [
    {
      op: "add",
      path: `/windows/${winId}`,
      value: {
        id: winId,
        title: "Files",
        x: 88,
        y: 72,
        width: 480,
        height: 360,
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
        props: { title: "Files", windowId: winId },
        children: ["files-scroll", "files-preview"],
      },
    },
    {
      op: "add",
      path: "/widgets/files-scroll",
      value: {
        id: "files-scroll",
        type: "scroll-area",
        props: { maxHeight: 160, className: "files-scroll" },
        children: ["files-list"],
      },
    },
    {
      op: "add",
      path: "/widgets/files-list",
      value: {
        id: "files-list",
        type: "list",
        props: { items, selectedId: "readme", className: "files-list" },
        behavior: "local",
      },
    },
    {
      op: "add",
      path: "/widgets/files-preview",
      value: {
        id: "files-preview",
        type: "text",
        props: { text: FILES.readme, className: "files-preview" },
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
      value: { windowId: winId, widgetId: "dock-files" },
    },
    {
      op: "add",
      path: "/apps/files",
      value: { open: true, selected: "readme" },
    },
    {
      op: "add",
      path: "/handlers/focus-files",
      value: {
        match: { type: "click", targetId: "dock-files" },
        when: "!!state.windows['win-files']",
        statePatch: [
          {
            op: "replace",
            path: "/focus",
            value: { windowId: winId, widgetId: "dock-files" },
          },
        ],
        uiPatch: [],
      },
    },
  ];
  const uiPatch = statePatch.filter((op) => op.path.startsWith("/widgets"));
  return { statePatch, uiPatch };
}

export function filesContents(): Record<string, string> {
  return FILES;
}

defineApp({
  id: "files",
  title: "Files",
  dockId: "dock-files",
  windowId: "win-files",
  dockLabel: "📁",
  dockTitle: "Files",
  aliases: ["file"],
  open: () => filesWindowPatches(),
});
