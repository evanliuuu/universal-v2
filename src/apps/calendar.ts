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
  reflex: (doc, event) => {
    if (event.type !== "click" || !event.targetId) return null;
    const targetId = event.targetId;
    const widget = doc.state.widgets[targetId];
    if (!widget || widget.behavior !== "local") return null;

    if (targetId === "day-15") {
      const selected = (widget.props.className as string)?.includes("selected");
      const nextClass = selected ? "day-cell" : "day-cell selected";
      return {
        handled: true,
        statePatch: [
          { op: "replace", path: `/widgets/${targetId}/props/className`, value: nextClass },
          {
            op: "replace",
            path: "/apps/calendar/selectedDate",
            value: selected ? null : "2026-08-15",
          },
        ],
        uiPatch: [
          { op: "replace", path: `/widgets/${targetId}/props/className`, value: nextClass },
        ],
      };
    }

    if (targetId === "cal-prev" || targetId === "cal-next") {
      const label = doc.state.widgets["cal-label"];
      const text = String(label?.props.text ?? "August 2026");
      const months = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ];
      const match = text.match(/^(\w+)\s+(\d{4})$/);
      let month = 7;
      let year = 2026;
      if (match) {
        month = months.indexOf(match[1]);
        year = Number(match[2]);
      }
      if (targetId === "cal-prev") month -= 1;
      else month += 1;
      if (month < 0) {
        month = 11;
        year -= 1;
      }
      if (month > 11) {
        month = 0;
        year += 1;
      }
      const next = `${months[month]} ${year}`;
      return {
        handled: true,
        statePatch: [
          { op: "replace", path: "/widgets/cal-label/props/text", value: next },
          { op: "replace", path: "/apps/calendar/view", value: "month" },
        ],
        uiPatch: [
          { op: "replace", path: "/widgets/cal-label/props/text", value: next },
        ],
      };
    }

    return null;
  },
});
