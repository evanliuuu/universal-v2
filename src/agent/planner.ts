import { SemanticEvent, UniversalState } from "../protocol/types";

export type AgentPlan = {
  action:
    | "open_app"
    | "focus_app"
    | "set_theme"
    | "set_budget"
    | "noop";
  app?: "calendar" | "notes" | "settings";
  theme?: string;
  tokenLimit?: number;
  rationale: string;
};

/** Planner: decide *what* to do from (state, event). No patches yet. */
export function planMock(
  state: UniversalState,
  event: SemanticEvent,
): AgentPlan {
  if (event.type === "instruction" && typeof event.value === "string") {
    return parseInstruction(event.value, state);
  }

  if (event.type === "click" && event.targetId === "dock-calendar") {
    if (state.windows["win-calendar"]) {
      return {
        action: "focus_app",
        app: "calendar",
        rationale: "Calendar open; focus window.",
      };
    }
    return { action: "open_app", app: "calendar", rationale: "Open calendar." };
  }

  if (event.type === "click" && event.targetId === "dock-notes") {
    if (state.windows["win-notes"]) {
      return {
        action: "focus_app",
        app: "notes",
        rationale: "Notes open; focus window.",
      };
    }
    return { action: "open_app", app: "notes", rationale: "Open notes." };
  }

  if (event.type === "click" && event.targetId === "dock-settings") {
    if (state.windows["win-settings"]) {
      return {
        action: "focus_app",
        app: "settings",
        rationale: "Settings open; focus window.",
      };
    }
    return { action: "open_app", app: "settings", rationale: "Open settings." };
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

  if (lower.includes("calendar")) {
    return state.windows["win-calendar"]
      ? { action: "focus_app", app: "calendar", rationale: text }
      : { action: "open_app", app: "calendar", rationale: text };
  }
  if (lower.includes("note")) {
    return state.windows["win-notes"]
      ? { action: "focus_app", app: "notes", rationale: text }
      : { action: "open_app", app: "notes", rationale: text };
  }
  if (lower.includes("setting")) {
    return state.windows["win-settings"]
      ? { action: "focus_app", app: "settings", rationale: text }
      : { action: "open_app", app: "settings", rationale: text };
  }

  if (lower.includes("dark") || lower.includes("win95")) {
    const theme = lower.includes("win95") ? "win95" : "dark";
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

  return { action: "noop", rationale: `Unrecognized instruction: ${text}` };
}
