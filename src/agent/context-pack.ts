import { listApps } from "../apps";
import { UniversalState } from "../protocol/types";

/** Compact state summary for planner/executor prompts. */
export type PlannerContext = {
  theme: string;
  focus: { window?: string; widget?: string };
  openApps: string[];
  dock: string[];
  windows: Array<{ id: string; title: string; minimized: boolean }>;
  budget: {
    tokensUsed: number;
    tokenLimit: number;
    prefetchEnabled: boolean;
  };
};

export function buildPlannerContext(state: UniversalState): PlannerContext {
  const appByWindow = new Map(
    listApps().map((app) => [app.windowId, app.id]),
  );

  const openApps = Object.keys(state.windows)
    .map((winId) => appByWindow.get(winId) ?? winId.replace(/^win-/, ""))
    .sort();

  return {
    theme: state.meta.theme,
    focus: {
      window: state.focus?.windowId,
      widget: state.focus?.widgetId,
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
  };
}
