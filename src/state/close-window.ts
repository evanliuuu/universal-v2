import { JsonPatchOp, UniversalState, WidgetNode } from "../protocol/types";

export type CloseWindowApp = {
  id: string;
  dockId: string;
};

function widgetSubtreeIds(
  widgets: Record<string, WidgetNode>,
  rootId: string,
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id) || !widgets[id]) return;
    seen.add(id);
    ids.push(id);
    for (const child of widgets[id].children ?? []) visit(child);
  };
  visit(rootId);
  return ids;
}

/** Shared close patches for titlebar reflex and planner close_app. */
export function closeWindowPatches(
  state: UniversalState,
  winId: string,
  app?: CloseWindowApp,
): JsonPatchOp[] {
  const win = state.windows[winId];
  if (!win) return [];

  const statePatch: JsonPatchOp[] = [
    { op: "remove", path: `/windows/${winId}` },
    {
      op: "replace",
      path: `/widgets/desktop/children`,
      value: (state.widgets.desktop.children ?? []).filter(
        (id) => id !== win.rootId,
      ),
    },
    ...widgetSubtreeIds(state.widgets, win.rootId).map((id) => ({
      op: "remove" as const,
      path: `/widgets/${id}`,
    })),
  ];

  const appSlice = app ? state.apps[app.id] : undefined;
  if (
    appSlice &&
    typeof appSlice === "object" &&
    appSlice !== null &&
    "open" in appSlice
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
