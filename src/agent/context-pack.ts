import { listApps } from "../apps";
import { UniversalState, WidgetNode } from "../protocol/types";

const RECENT_EVENT_LIMIT = 5;

export type FocusedWindow = {
  id: string;
  title: string;
};

export type FocusedWidget = {
  id: string;
  type: string;
  label?: string;
  title?: string;
};

export type RecentEventSummary = {
  type: string;
  targetId?: string;
  value?: unknown;
};

/** Compact state summary for planner/executor prompts. */
export type PlannerContext = {
  theme: string;
  focus: { window?: FocusedWindow; widget?: FocusedWidget };
  openApps: string[];
  dock: string[];
  windows: Array<{ id: string; title: string; minimized: boolean }>;
  budget: {
    tokensUsed: number;
    tokenLimit: number;
    prefetchEnabled: boolean;
  };
  recentEvents: RecentEventSummary[];
};

function stringProp(widget: WidgetNode, key: string): string | undefined {
  const value = widget.props[key];
  return typeof value === "string" ? value : undefined;
}

function focusedWindow(state: UniversalState): FocusedWindow | undefined {
  const id = state.focus?.windowId;
  if (!id) return undefined;
  const win = state.windows[id];
  return { id, title: win?.title ?? id };
}

function focusedWidget(state: UniversalState): FocusedWidget | undefined {
  const id = state.focus?.widgetId;
  if (!id) return undefined;
  const widget = state.widgets[id];
  if (!widget) return { id, type: "unknown" };
  const label = stringProp(widget, "label");
  const title = stringProp(widget, "title") ?? stringProp(widget, "text");
  return {
    id: widget.id,
    type: widget.type,
    ...(label !== undefined ? { label } : {}),
    ...(title !== undefined ? { title } : {}),
  };
}

export function summarizeRecentEvents(
  events: Array<{ type: string; targetId?: string; value?: unknown }>,
  limit = RECENT_EVENT_LIMIT,
): RecentEventSummary[] {
  return events.slice(-limit).map((event) => {
    const summary: RecentEventSummary = { type: event.type };
    if (event.targetId !== undefined) summary.targetId = event.targetId;
    if (event.value !== undefined) summary.value = event.value;
    return summary;
  });
}

/** Newest-first event log → chronological last N events. */
export function recentEventsFromLog(
  log: Array<{ event: { type: string; targetId?: string; value?: unknown } }>,
  limit = RECENT_EVENT_LIMIT,
): RecentEventSummary[] {
  return summarizeRecentEvents(
    log
      .slice(0, limit)
      .reverse()
      .map((entry) => entry.event),
    limit,
  );
}

export function buildPlannerContext(
  state: UniversalState,
  recentEvents: RecentEventSummary[] = [],
): PlannerContext {
  const appByWindow = new Map(
    listApps().map((app) => [app.windowId, app.id]),
  );

  const openApps = Object.keys(state.windows)
    .map((winId) => appByWindow.get(winId) ?? winId.replace(/^win-/, ""))
    .sort();

  return {
    theme: state.meta.theme,
    focus: {
      window: focusedWindow(state),
      widget: focusedWidget(state),
    },
    openApps,
    dock: state.desktop.dock,
    windows: Object.values(state.windows).map((win) => ({
      id: win.id,
      title: win.title,
      minimized: win.minimized,
    })),
    budget: {
      tokensUsed: state.meta.budget.tokensUsed,
      tokenLimit: state.meta.budget.tokenLimit,
      prefetchEnabled: state.meta.budget.prefetchEnabled,
    },
    recentEvents: summarizeRecentEvents(recentEvents),
  };
}
