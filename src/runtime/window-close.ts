import { listApps } from "../apps";
import { JsonPatchOp, UniversalState, WidgetNode } from "../protocol/types";

function collectWidgetSubtree(
  widgets: Record<string, WidgetNode>,
  rootId: string,
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    const node = widgets[id];
    for (const child of node?.children ?? []) stack.push(child);
  }
  return ids;
}

/** Patches to close a window without leaving nested widgets or apps.open behind. */
export function closeWindowPatches(
  state: UniversalState,
  winId: string,
): JsonPatchOp[] {
  const win = state.windows[winId];
  if (!win) return [];

  const app = listApps().find((item) => item.windowId === winId);
  const widgetIds = collectWidgetSubtree(state.widgets, win.rootId);
  const statePatch: JsonPatchOp[] = [
    { op: "remove", path: `/windows/${winId}` },
    {
      op: "replace",
      path: `/widgets/desktop/children`,
      value: (state.widgets.desktop.children ?? []).filter(
        (id) => id !== win.rootId,
      ),
    },
    ...widgetIds.map((id) => ({
      op: "remove" as const,
      path: `/widgets/${id}`,
    })),
  ];

  const appState = app ? state.apps[app.id] : undefined;
  if (
    app &&
    appState &&
    typeof appState === "object" &&
    appState !== null &&
    "open" in appState
  ) {
    statePatch.push({
      op: "replace",
      path: `/apps/${app.id}/open`,
      value: false,
    });
  }

  if (state.focus?.windowId === winId) {
    statePatch.push({
      op: "replace",
      path: "/focus",
      value: { widgetId: app?.dockId ?? state.focus.widgetId },
    });
  }

  return statePatch;
}
