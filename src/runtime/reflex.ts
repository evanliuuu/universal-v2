import { listApps } from "../apps";
import { JsonPatchOp, SemanticEvent } from "../protocol/types";
import { UniversalDocument } from "../state/patch";

export type ReflexResult = {
  handled: boolean;
  statePatch: JsonPatchOp[];
  uiPatch: JsonPatchOp[];
};

/** Local reducers — core plus per-app reflex hooks from the App SDK. */
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
        {
          op: "replace",
          path: `/widgets/desktop/children`,
          value: (doc.state.widgets.desktop.children ?? []).filter(
            (id) => id !== win.rootId,
          ),
        },
        { op: "remove", path: `/widgets/${win.rootId}` },
      ],
      uiPatch: [],
    };
  }

  if (event.type === "resize_window" && event.value) {
    const payload = event.value as {
      windowId?: string;
      width?: number;
      height?: number;
    };
    const winId = String(payload.windowId ?? "");
    const width = Number(payload.width);
    const height = Number(payload.height);
    if (!winId || !doc.state.windows[winId]) return empty;
    if (!Number.isFinite(width) || !Number.isFinite(height)) return empty;
    return {
      handled: true,
      statePatch: [
        {
          op: "replace",
          path: `/windows/${winId}/width`,
          value: Math.max(280, Math.round(width)),
        },
        {
          op: "replace",
          path: `/windows/${winId}/height`,
          value: Math.max(180, Math.round(height)),
        },
      ],
      uiPatch: [],
    };
  }

  for (const app of listApps()) {
    if (!app.reflex) continue;
    const result = app.reflex(doc, event);
    if (result?.handled) return result;
  }

  if (event.type !== "click" && event.type !== "input") return empty;

  const targetId = event.targetId;
  if (!targetId) return empty;

  const widget = doc.state.widgets[targetId];
  if (!widget) return empty;

  const behavior =
    widget.behavior ?? (event.type === "input" ? "local" : "agent");
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

  return empty;
}
