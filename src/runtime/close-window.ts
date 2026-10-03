import { listApps } from "../apps";
import { JsonPatchOp, UniversalState, WidgetNode } from "../protocol/types";

/** Walk a widget tree and collect the root plus every descendant id. */
export function descendantWidgetIds(
  widgets: Record<string, WidgetNode>,
  rootId: string,
): string[] {
  const seen = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const children = widgets[id]?.children;
    if (children) {
      for (const child of children) stack.push(child);
    }
  }
  return [...seen];
}

/**
 * Tear down a window: drop the window record, its widget tree, desktop
 * membership, and the matching /apps/<id> leftover. Focus is cleared when
 * it still pointed at the gone window.
 */
export function closeWindowPatches(
  state: UniversalState,
  winId: string,
): JsonPatchOp[] | null {
  const win = state.windows[winId];
  if (!win) return null;

  const app = listApps().find((item) => item.windowId === winId);
  const widgetIds = descendantWidgetIds(state.widgets, win.rootId);
  const ops: JsonPatchOp[] = [
    { op: "remove", path: `/windows/${winId}` },
    {
      op: "replace",
      path: `/widgets/desktop/children`,
      value: (state.widgets.desktop.children ?? []).filter(
        (id) => id !== win.rootId,
      ),
    },
  ];

  for (const id of widgetIds) {
    if (state.widgets[id]) {
      ops.push({ op: "remove", path: `/widgets/${id}` });
    }
  }

  if (app && state.apps[app.id] != null) {
    ops.push({ op: "remove", path: `/apps/${app.id}` });
  }

  if (state.focus?.windowId === winId) {
    ops.push({
      op: "replace",
      path: "/focus",
      value: { widgetId: app?.dockId ?? state.focus.widgetId },
    });
  }

  return ops;
}
