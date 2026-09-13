import { JsonPatchOp } from "../protocol/types";
import { defineApp } from "./registry";
import { DOCS, type DocsTab } from "./docs-content";

const TABS: Array<{ id: DocsTab; label: string }> = [
  { id: "architecture", label: "Architecture" },
  { id: "widgets", label: "Widgets" },
  { id: "tutorial", label: "Tutorial" },
];

export function docsWindowPatches(): {
  statePatch: JsonPatchOp[];
  uiPatch: JsonPatchOp[];
} {
  const winId = "win-docs";
  const rootId = "docs-root";
  const statePatch: JsonPatchOp[] = [
    {
      op: "add",
      path: `/windows/${winId}`,
      value: {
        id: winId,
        title: "Docs",
        x: 72,
        y: 56,
        width: 560,
        height: 420,
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
        props: { title: "Docs", windowId: winId },
        children: ["docs-tabs", "docs-scroll"],
      },
    },
    {
      op: "add",
      path: "/widgets/docs-tabs",
      value: {
        id: "docs-tabs",
        type: "tabs",
        props: {
          activeTab: "architecture",
          tabs: TABS,
        },
        behavior: "local",
      },
    },
    {
      op: "add",
      path: "/widgets/docs-scroll",
      value: {
        id: "docs-scroll",
        type: "scroll-area",
        props: { maxHeight: 280, className: "files-scroll" },
        children: ["docs-body"],
      },
    },
    {
      op: "add",
      path: "/widgets/docs-body",
      value: {
        id: "docs-body",
        type: "text",
        props: { text: DOCS.architecture, className: "files-preview" },
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
      value: { windowId: winId, widgetId: "dock-docs" },
    },
    {
      op: "add",
      path: "/apps/docs",
      value: { open: true, activeTab: "architecture" },
    },
    {
      op: "add",
      path: "/handlers/focus-docs",
      value: {
        match: { type: "click", targetId: "dock-docs" },
        when: "!!state.windows['win-docs']",
        statePatch: [
          {
            op: "replace",
            path: "/focus",
            value: { windowId: winId, widgetId: "dock-docs" },
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
  id: "docs",
  title: "Docs",
  dockId: "dock-docs",
  windowId: "win-docs",
  dockLabel: "📘",
  dockTitle: "Docs",
  aliases: ["documentation", "docs", "tutorial", "catalog"],
  open: () => docsWindowPatches(),
  reflex: (_doc, event) => {
    if (event.type !== "click" || !event.targetId?.startsWith("tab-")) {
      return null;
    }
    const tab = event.targetId.replace("tab-", "") as DocsTab;
    if (!(tab in DOCS)) return null;
    return {
      handled: true,
      statePatch: [
        { op: "replace", path: "/widgets/docs-tabs/props/activeTab", value: tab },
        { op: "replace", path: "/apps/docs/activeTab", value: tab },
        { op: "replace", path: "/widgets/docs-body/props/text", value: DOCS[tab] },
      ],
      uiPatch: [
        { op: "replace", path: "/widgets/docs-tabs/props/activeTab", value: tab },
        { op: "replace", path: "/widgets/docs-body/props/text", value: DOCS[tab] },
      ],
    };
  },
});
