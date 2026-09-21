import { listApps } from "../apps";
import { JsonPatchOp, SemanticEvent, WidgetNode } from "../protocol/types";
import { UniversalDocument } from "../state/patch";

export type ReflexResult = {
  handled: boolean;
  statePatch: JsonPatchOp[];
  uiPatch: JsonPatchOp[];
};

type WindowPayload = {
  action?: string;
  windowId?: string;
  x?: number;
  y?: number;
};

function asPayload(value: unknown): WindowPayload | null {
  if (!value || typeof value !== "object") return null;
  return value as WindowPayload;
}

function parentWidgetId(
  childId: string,
  widgets: Record<string, WidgetNode>,
): string | undefined {
  for (const [id, node] of Object.entries(widgets)) {
    if (node.children?.includes(childId)) return id;
  }
  return undefined;
}

function windowIdFromTarget(
  doc: UniversalDocument,
  targetId?: string,
): string | undefined {
  let id = targetId;
  while (id) {
    const node = doc.state.widgets[id];
    if (!node) break;
    if (node.type === "window") {
      const winId = String(node.props.windowId ?? "");
      return winId && doc.state.windows[winId] ? winId : undefined;
    }
    id = parentWidgetId(id, doc.state.widgets);
  }
  return undefined;
}

function maxWindowZ(doc: UniversalDocument): number {
  const zs = Object.values(doc.state.windows).map((win) => win.z ?? 1);
  return zs.length ? Math.max(...zs) : 1;
}

function raisePatches(doc: UniversalDocument, winId: string): JsonPatchOp[] {
  const win = doc.state.windows[winId];
  if (!win) return [];
  const current = win.z ?? 1;
  const contested = Object.entries(doc.state.windows).some(
    ([id, other]) => id !== winId && (other.z ?? 1) >= current,
  );
  const nextZ = contested ? maxWindowZ(doc) + 1 : current;
  const ops: JsonPatchOp[] = [
    {
      op: "replace",
      path: "/focus",
      value: {
        windowId: winId,
        widgetId: doc.state.focus?.widgetId,
      },
    },
  ];
  if (nextZ !== current) {
    ops.unshift({ op: "replace", path: `/windows/${winId}/z`, value: nextZ });
    ops.push({
      op: "add",
      path: `/widgets/${win.rootId}/props/z`,
      value: nextZ,
    });
  }
  return ops;
}

function movePatches(
  doc: UniversalDocument,
  winId: string,
  x: number,
  y: number,
): JsonPatchOp[] {
  const win = doc.state.windows[winId];
  if (!win) return [];
  const nextX = Math.max(0, Math.round(x));
  const nextY = Math.max(0, Math.round(y));
  return [
    ...raisePatches(doc, winId),
    { op: "replace", path: `/windows/${winId}/x`, value: nextX },
    { op: "replace", path: `/windows/${winId}/y`, value: nextY },
    { op: "add", path: `/widgets/${win.rootId}/props/x`, value: nextX },
    { op: "add", path: `/widgets/${win.rootId}/props/y`, value: nextY },
  ];
}

function mergeRaise(doc: UniversalDocument, event: SemanticEvent, result: ReflexResult): ReflexResult {
  const winId =
    asPayload(event.value)?.windowId ?? windowIdFromTarget(doc, event.targetId);
  if (!winId || !doc.state.windows[winId]) return result;
  return {
    handled: true,
    statePatch: [...raisePatches(doc, winId), ...result.statePatch],
    uiPatch: result.uiPatch,
  };
}

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

  if (event.type === "minimize_window" && event.value) {
    const winId = String(event.value);
    const win = doc.state.windows[winId];
    if (!win) return empty;
    return {
      handled: true,
      statePatch: [
        {
          op: "replace",
          path: `/windows/${winId}/minimized`,
          value: true,
        },
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
        ...raisePatches(doc, winId),
      ],
      uiPatch: [],
    };
  }

  const payload = asPayload(event.value);
  const moveWinId = String(payload?.windowId ?? "");
  if (
    (event.type === "move_window" || payload?.action === "move") &&
    moveWinId &&
    doc.state.windows[moveWinId]
  ) {
    const x = Number(payload?.x);
    const y = Number(payload?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return empty;
    return { handled: true, statePatch: movePatches(doc, moveWinId, x, y), uiPatch: [] };
  }

  if (event.type === "click" && payload?.action === "raise" && moveWinId) {
    if (!doc.state.windows[moveWinId]) return empty;
    return { handled: true, statePatch: raisePatches(doc, moveWinId), uiPatch: [] };
  }

  if (event.type === "click" && event.targetId) {
    const dockApp = listApps().find((app) => app.dockId === event.targetId);
    const dockWin = dockApp ? doc.state.windows[dockApp.windowId] : undefined;
    if (dockApp && dockWin?.minimized) {
      return {
        handled: true,
        statePatch: [
          {
            op: "replace",
            path: `/windows/${dockApp.windowId}/minimized`,
            value: false,
          },
          ...raisePatches(doc, dockApp.windowId),
        ],
        uiPatch: [],
      };
    }
  }

  for (const app of listApps()) {
    if (!app.reflex) continue;
    const result = app.reflex(doc, event);
    if (result?.handled) return mergeRaise(doc, event, result);
  }

  if (event.type === "click") {
    const winId = windowIdFromTarget(doc, event.targetId);
    if (winId) {
      return { handled: true, statePatch: raisePatches(doc, winId), uiPatch: [] };
    }
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
