import { getApp } from "../apps";
import { AgentResponse, UniversalState } from "../protocol/types";
import { AgentPlan } from "./planner";

/** Executor: turn a plan into validated patch deltas. */
export function executePlan(
  plan: AgentPlan,
  state?: UniversalState,
): AgentResponse {
  switch (plan.action) {
    case "open_app": {
      if (!plan.app) break;
      const app = getApp(plan.app);
      if (!app) break;
      const patches = app.open(state);
      const handlerOps =
        app.handlers?.flatMap((handler) => [
          {
            op: "add" as const,
            path: `/handlers/${app.id}-${handler.match.type}-${handler.match.targetId ?? "any"}`,
            value: handler,
          },
        ]) ?? [];
      // Prefer handlers already embedded in open(); only add missing ones.
      const existing = new Set(
        patches.statePatch
          .filter((op) => op.path.startsWith("/handlers/"))
          .map((op) => op.path),
      );
      const extra = handlerOps.filter((op) => !existing.has(op.path));
      return {
        statePatch: [...patches.statePatch, ...extra],
        uiPatch: patches.uiPatch,
        rationale: plan.rationale,
      };
    }
    case "focus_app": {
      if (!plan.app) break;
      const app = getApp(plan.app);
      if (!app) break;
      return {
        statePatch: [
          {
            op: "replace",
            path: "/focus",
            value: { windowId: app.windowId, widgetId: app.dockId },
          },
        ],
        uiPatch: [],
        rationale: plan.rationale,
      };
    }
    case "set_theme":
      return {
        statePatch: [
          { op: "replace", path: "/meta/theme", value: plan.theme ?? "cupertino" },
        ],
        uiPatch: [],
        rationale: plan.rationale,
      };
    case "set_budget":
      return {
        statePatch: [
          {
            op: "replace",
            path: "/meta/budget/tokenLimit",
            value: plan.tokenLimit ?? 50_000,
          },
        ],
        uiPatch: [],
        rationale: plan.rationale,
      };
    case "noop":
    default:
      break;
  }

  return {
    statePatch: [],
    uiPatch: [],
    rationale: plan.rationale,
  };
}
