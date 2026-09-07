import { JsonPatchOp } from "../protocol/types";
import { defineApp } from "./registry";

export function calendarWindowPatches(): {
  statePatch: JsonPatchOp[];
  uiPatch: JsonPatchOp[];
} {
  const winId = "win-calendar";
  const rootId = "calendar-root";
  const statePatch: JsonPatchOp[] = [
    {
      op: "add",
      path: `/windows/${winId}`,
      value: {
        id: winId,
        title: "Calendar",
        x: 120,
        y: 96,
        width: 520,
        height: 400,
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
        props: { title: "Calendar", windowId: winId },
        children: ["calendar-toolbar", "calendar-body"],
      },
    },
    {
      op: "add",
      path: "/widgets/calendar-toolbar",
      value: {
        id: "calendar-toolbar",
        type: "box",
        props: { className: "toolbar" },
        children: ["cal-prev", "cal-label", "cal-next"],
      },
    },
    {
      op: "add",
      path: "/widgets/cal-prev",
      value: {
        id: "cal-prev",
        type: "button",
        props: { label: "◀", className: "toolbar-btn" },
        behavior: "local",
      },
    },
    {
      op: "add",
      path: "/widgets/cal-label",
      value: {
        id: "cal-label",
        type: "text",
        props: { text: "August 2026", className: "toolbar-label" },
      },
    },
    {
      op: "add",
      path: "/widgets/cal-next",
      value: {
        id: "cal-next",
        type: "button",
        props: { label: "▶", className: "toolbar-btn" },
        behavior: "local",
      },
    },
    {
      op: "add",
      path: "/widgets/calendar-body",
      value: {
        id: "calendar-body",
        type: "box",
        props: { className: "calendar-grid" },
        children: ["day-15"],
      },
    },
    {
      op: "add",
      path: "/widgets/day-15",
      value: {
        id: "day-15",
        type: "button",
        props: { label: "15", className: "day-cell" },
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
      value: { windowId: winId, widgetId: "dock-calendar" },
    },
    {
      op: "add",
      path: "/apps/calendar",
      value: { open: true, selectedDate: null, view: "month" },
    },
    {
      op: "add",
      path: "/handlers/focus-calendar",
      value: {
        match: { type: "click", targetId: "dock-calendar" },
        when: "!!state.windows['win-calendar']",
        statePatch: [
          {
            op: "replace",
            path: "/focus",
            value: { windowId: winId, widgetId: "dock-calendar" },
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
  id: "calendar",
  title: "Calendar",
  dockId: "dock-calendar",
  windowId: "win-calendar",
  dockLabel: "📅",
  dockTitle: "Calendar",
  open: () => calendarWindowPatches(),
});
