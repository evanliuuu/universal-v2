import { getApp } from "../apps/registry";
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
      return { ...app.open(state), rationale: plan.rationale };
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
