import { JsonPatchOp } from "../protocol/types";
import { defineApp } from "./registry";

const CORE_FILES: Record<string, string> = {
  readme: "# Universal v2\n\nA tiny desktop driven by JSON patches.",
  todo: "- [ ] add more widgets\n- [ ] cloud sync",
  meeting: "Standup notes\n\nShipped the app registry.",
};

const CORE_ITEMS = [
  { id: "readme", label: "readme.md" },
  { id: "todo", label: "todo.txt" },
  { id: "meeting", label: "meeting.txt" },
];

function extraFiles(count = 60): {
  files: Record<string, string>;
  items: Array<{ id: string; label: string }>;
} {
  const files: Record<string, string> = {};
  const items: Array<{ id: string; label: string }> = [];
  for (let i = 1; i <= count; i++) {
    const id = `log-${String(i).padStart(2, "0")}`;
    files[id] = `Session log ${i}\nGenerated to keep the file list long enough to virtualize.`;
    items.push({ id, label: `${id}.txt` });
  }
  return { files, items };
}

const extras = extraFiles();
export const FILES: Record<string, string> = { ...CORE_FILES, ...extras.files };
export const FILE_ITEMS = [...CORE_ITEMS, ...extras.items];

export function filesWindowPatches(): {
  statePatch: JsonPatchOp[];
  uiPatch: JsonPatchOp[];
} {
  const winId = "win-files";
  const rootId = "files-root";
  const items = FILE_ITEMS;
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
        props: { maxHeight: 432, className: "files-scroll" },
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

defineApp({
  id: "files",
  title: "Files",
  dockId: "dock-files",
  windowId: "win-files",
  dockLabel: "📁",
  dockTitle: "Files",
  aliases: ["file"],
  open: () => filesWindowPatches(),
  reflex: (_doc, event) => {
    if (
      event.type !== "click" ||
      event.targetId !== "files-list" ||
      typeof event.value !== "string"
    ) {
      return null;
    }
    const body = FILES[event.value];
    if (!body) return null;
    return {
      handled: true,
      statePatch: [
        {
          op: "replace",
          path: "/widgets/files-list/props/selectedId",
          value: event.value,
        },
        {
          op: "replace",
          path: "/widgets/files-preview/props/text",
          value: body,
        },
        { op: "replace", path: "/apps/files/selected", value: event.value },
      ],
      uiPatch: [
        {
          op: "replace",
          path: "/widgets/files-list/props/selectedId",
          value: event.value,
        },
        {
          op: "replace",
          path: "/widgets/files-preview/props/text",
          value: body,
        },
      ],
    };
  },
});
