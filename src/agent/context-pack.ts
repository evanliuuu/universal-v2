import { listApps } from "../apps/registry";
import { SemanticEvent, UniversalState, WidgetNode } from "../protocol/types";

/** Compact prior-event summary for planner/executor prompts. */
export type RecentEventSummary = {
  type: string;
  targetId?: string;
  value?: string;
};

export type FocusedWidget = {
  id: string;
  type: string;
  label?: string;
  title?: string;
};

/** Compact state summary for planner/executor prompts. */
export type PlannerContext = {
  theme: string;
  focus: { window?: string; widget?: string };
  focusedWindow?: { id: string; title: string; minimized: boolean };
  focusedWidget?: FocusedWidget;
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

const RECENT_EVENT_LIMIT = 5;
const RECENT_VALUE_LIMIT = 80;

function stringProp(
  props: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = props[key];
  return typeof value === "string" && value ? value : undefined;
}

function summarizeWidget(
  widget: WidgetNode | undefined,
): FocusedWidget | undefined {
  if (!widget) return undefined;
  return {
    id: widget.id,
    type: widget.type,
    label: stringProp(widget.props, "label"),
    title: stringProp(widget.props, "title"),
  };
}

export function summarizeRecentEvents(
  events: Array<Pick<SemanticEvent, "type" | "targetId" | "value">>,
  limit = RECENT_EVENT_LIMIT,
): RecentEventSummary[] {
  return events.slice(-limit).map((event) => {
    const summary: RecentEventSummary = { type: event.type };
    if (event.targetId) summary.targetId = event.targetId;
    if (typeof event.value === "string" && event.value) {
      summary.value = event.value.slice(0, RECENT_VALUE_LIMIT);
    }
    return summary;
  });
}

export function buildPlannerContext(
  state: UniversalState,
  recentEvents: Array<Pick<SemanticEvent, "type" | "targetId" | "value">> = [],
): PlannerContext {
  const appByWindow = new Map(
    listApps().map((app) => [app.windowId, app.id]),
  );

  const windows = Object.values(state.windows).map((win) => ({
    id: win.id,
    title: win.title,
    minimized: win.minimized,
  }));

  const openApps = Object.keys(state.windows)
    .map((winId) => appByWindow.get(winId) ?? winId.replace(/^win-/, ""))
    .sort();

  const focusedWindow = windows.find((win) => win.id === state.focus?.windowId);

  return {
    theme: state.meta.theme,
    focus: {
      window: state.focus?.windowId,
      widget: state.focus?.widgetId,
    },
    focusedWindow,
    focusedWidget: summarizeWidget(
      state.focus?.widgetId ? state.widgets[state.focus.widgetId] : undefined,
    ),
    openApps,
    dock: state.desktop.dock,
    windows,
    budget: {
      tokensUsed: state.meta.budget.tokensUsed,
      tokenLimit: state.meta.budget.tokenLimit,
      prefetchEnabled: state.meta.budget.prefetchEnabled,
    },
    recentEvents: summarizeRecentEvents(recentEvents),
  };
}
