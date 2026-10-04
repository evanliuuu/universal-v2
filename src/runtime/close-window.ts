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

/** Handlers owned by this app: focus-<id> plus <id>-* from the executor. */
export function appHandlerIds(
  handlers: Record<string, { match: { targetId?: string } }>,
  appId?: string,
  goneWidgetIds: Iterable<string> = [],
): string[] {
  const gone = new Set(goneWidgetIds);
  return Object.entries(handlers)
    .filter(([id, handler]) => {
      if (appId && (id === `focus-${appId}` || id.startsWith(`${appId}-`))) {
        return true;
      }
      return (
        handler.match.targetId != null && gone.has(handler.match.targetId)
      );
    })
    .map(([id]) => id);
}

/**
 * Tear down a window: drop the window record, its widget tree, desktop
 * membership, the matching /apps/<id> leftover, and compiled handlers
 * owned by that app. Focus is cleared when it still pointed at the gone
 * window.
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

  for (const id of appHandlerIds(state.handlers ?? {}, app?.id, widgetIds)) {
    ops.push({ op: "remove", path: `/handlers/${id}` });
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
