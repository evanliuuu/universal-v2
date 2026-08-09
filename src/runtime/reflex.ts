import { JsonPatchOp, SemanticEvent } from "../protocol/types";
import { UniversalDocument } from "../state/patch";

export type ReflexResult = {
  handled: boolean;
  statePatch: JsonPatchOp[];
  uiPatch: JsonPatchOp[];
};

/** Local reducers — reflex tier, no model call. */
export function tryReflex(
  doc: UniversalDocument,
  event: SemanticEvent,
): ReflexResult {
  const empty: ReflexResult = { handled: false, statePatch: [], uiPatch: [] };

  if (event.type === "close_window" && event.value) {
    const winId = String(event.value);
    const win = doc.state.windows[winId];
    if (!win) return empty;
    return {
      handled: true,
      statePatch: [
        { op: "remove", path: `/windows/${winId}` },
        { op: "replace", path: `/widgets/desktop/children`, value: (doc.state.widgets.desktop.children ?? []).filter((id) => id !== win.rootId) },
        { op: "remove", path: `/widgets/${win.rootId}` },
      ],
      uiPatch: [],
    };
  }

  if (event.type !== "click" && event.type !== "input") return empty;

  const targetId = event.targetId;
  if (!targetId) return empty;

  const widget = doc.state.widgets[targetId];
  if (!widget) return empty;

  const behavior = widget.behavior ?? (event.type === "input" ? "local" : "agent");
  if (behavior !== "local") return empty;

  if (event.type === "input" && typeof event.value === "string") {
    return {
      handled: true,
      statePatch: [
        {
          op: "replace",
          path: `/widgets/${targetId}/props/value`,
          value: event.value,
        },
      ],
      uiPatch: [
        {
          op: "replace",
          path: `/widgets/${targetId}/props/value`,
          value: event.value,
        },
      ],
    };
  }

  if (event.type === "click" && targetId === "day-15") {
    const selected = (widget.props.className as string)?.includes("selected");
    const nextClass = selected ? "day-cell" : "day-cell selected";
    return {
      handled: true,
      statePatch: [
        { op: "replace", path: `/widgets/${targetId}/props/className`, value: nextClass },
        { op: "replace", path: "/apps/calendar/selectedDate", value: selected ? null : "2026-08-15" },
      ],
      uiPatch: [
        { op: "replace", path: `/widgets/${targetId}/props/className`, value: nextClass },
      ],
    };
  }

  if (event.type === "click" && (targetId === "cal-prev" || targetId === "cal-next")) {
    const label = doc.state.widgets["cal-label"];
    const text = String(label?.props.text ?? "August 2026");
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const match = text.match(/^(\w+)\s+(\d{4})$/);
    let month = 7;
    let year = 2026;
    if (match) {
      month = months.indexOf(match[1]);
      year = Number(match[2]);
    }
    if (targetId === "cal-prev") month -= 1;
    else month += 1;
    if (month < 0) { month = 11; year -= 1; }
    if (month > 11) { month = 0; year += 1; }
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

  return empty;
}
