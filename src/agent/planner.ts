import { listApps } from "../apps";
import { SemanticEvent, UniversalState } from "../protocol/types";

export type AgentPlan = {
  action:
    | "open_app"
    | "focus_app"
    | "set_theme"
    | "set_budget"
    | "noop";
  app?: string;
  theme?: string;
  tokenLimit?: number;
  rationale: string;
};

function planForApp(
  appId: string,
  state: UniversalState,
  rationale: string,
): AgentPlan {
  const app = listApps().find((a) => a.id === appId);
  if (!app) {
    return { action: "noop", rationale: `Unknown app ${appId}` };
  }
  if (state.windows[app.windowId]) {
    return { action: "focus_app", app: app.id, rationale };
  }
  return { action: "open_app", app: app.id, rationale };
}

/** Planner: decide *what* to do from (state, event). No patches yet. */
export function planMock(
  state: UniversalState,
  event: SemanticEvent,
): AgentPlan {
  if (event.type === "instruction" && typeof event.value === "string") {
    return parseInstruction(event.value, state);
  }

  if (event.type === "click" && event.targetId) {
    const app = listApps().find((a) => a.dockId === event.targetId);
    if (app) {
      return planForApp(
        app.id,
        state,
        state.windows[app.windowId]
          ? `${app.title} open; focus window.`
          : `Open ${app.title.toLowerCase()}.`,
      );
    }
  }

  return {
    action: "noop",
    rationale: `No plan for ${event.type} ${event.targetId ?? ""}`,
  };
}

export function parseInstruction(
  text: string,
  state: UniversalState,
): AgentPlan {
  const lower = text.toLowerCase();

  for (const app of listApps()) {
    const names = [app.id, app.title, ...(app.aliases ?? [])].map((n) =>
      n.toLowerCase(),
    );
    if (names.some((name) => lower.includes(name))) {
      return planForApp(app.id, state, text);
    }
  }

  if (
    lower.includes("dark") ||
    lower.includes("win95") ||
    lower.includes("material") ||
    lower.includes("high contrast") ||
    lower.includes("high-contrast") ||
    lower.includes("custom theme") ||
    /\bcustom\b/.test(lower)
  ) {
    let theme = "dark";
    if (lower.includes("win95")) theme = "win95";
    else if (lower.includes("material")) theme = "material";
    else if (lower.includes("high contrast") || lower.includes("high-contrast")) {
      theme = "high-contrast";
    } else if (lower.includes("custom")) theme = "custom";
    return { action: "set_theme", theme, rationale: text };
  }

  if (lower.includes("token") && (lower.includes("double") || lower.includes("2x"))) {
    const current = (state.meta.budget as { tokenLimit?: number })?.tokenLimit ?? 50_000;
    return {
      action: "set_budget",
      tokenLimit: current * 2,
      rationale: text,
    };
  }

  const tokenLimitMatch = lower.match(/token limit(?: to)? (\d+)/);
  if (lower.includes("token") && tokenLimitMatch) {
    return {
      action: "set_budget",
      tokenLimit: Number(tokenLimitMatch[1]),
      rationale: text,
    };
  }

  return { action: "noop", rationale: `Unrecognized instruction: ${text}` };
}
