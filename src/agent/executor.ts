import { AgentResponse, UniversalState } from "../protocol/types";
import { AgentPlan } from "./planner";
import {
  calendarWindowPatches,
  notesWindowPatches,
  settingsWindowPatches,
} from "../state/seed";

const FOCUS: Record<string, string> = {
  calendar: "win-calendar",
  notes: "win-notes",
  settings: "win-settings",
};

const DOCK: Record<string, string> = {
  calendar: "dock-calendar",
  notes: "dock-notes",
  settings: "dock-settings",
};

/** Executor: turn a plan into validated patch deltas. */
export function executePlan(
  plan: AgentPlan,
  state?: UniversalState,
): AgentResponse {
  switch (plan.action) {
    case "open_app": {
      if (plan.app === "calendar") {
        return { ...calendarWindowPatches(), rationale: plan.rationale };
      }
      if (plan.app === "notes") {
        return { ...notesWindowPatches(), rationale: plan.rationale };
      }
      if (plan.app === "settings") {
        return { ...settingsWindowPatches(state), rationale: plan.rationale };
      }
      break;
    }
    case "focus_app": {
      const winId = plan.app ? FOCUS[plan.app] : undefined;
      const dockId = plan.app ? DOCK[plan.app] : undefined;
      if (!winId) break;
      return {
        statePatch: [
          {
            op: "replace",
            path: "/focus",
            value: { windowId: winId, widgetId: dockId },
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
