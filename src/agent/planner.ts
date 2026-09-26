import { listApps } from "../apps";
import { SemanticEvent, UniversalState } from "../protocol/types";

export type AgentPlan = {
  action:
    | "open_app"
    | "focus_app"
    | "close_app"
    | "minimize_app"
    | "maximize_app"
    | "unmaximize_app"
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

function appNames(app: { id: string; title: string; aliases?: string[] }): string[] {
  return [app.id, app.title, ...(app.aliases ?? [])].map((n) => n.toLowerCase());
}

function mentionsApp(
  lower: string,
  app: { id: string; title: string; aliases?: string[] },
): boolean {
  return appNames(app).some((name) => lower.includes(name));
}

function isCloseIntent(lower: string): boolean {
  return /\b(close|shut|dismiss)\b/.test(lower);
}

function isMinimizeIntent(lower: string): boolean {
  return /\b(minimize|minimise)\b/.test(lower);
}

function isMaximizeIntent(lower: string): boolean {
  return (
    /\b(maximize|maximise|fullscreen|full-screen)\b/.test(lower) ||
    lower.includes("full screen")
  );
}

function isRestoreIntent(lower: string): boolean {
  return /\brestore\b/.test(lower);
}

function isUnmaximizeIntent(lower: string): boolean {
  return (
    /\b(unmaximize|unmaximise)\b/.test(lower) ||
    /\bexit\s+(full-?screen|fullscreen)\b/.test(lower) ||
    lower.includes("exit full screen")
  );
}

function planCloseApp(
  appId: string,
  state: UniversalState,
  rationale: string,
): AgentPlan {
  const app = listApps().find((a) => a.id === appId);
  if (!app) {
    return { action: "noop", rationale: `Unknown app ${appId}` };
  }
  if (!state.windows[app.windowId]) {
    return { action: "noop", rationale: `${app.title} is not open.` };
  }
  return { action: "close_app", app: app.id, rationale };
}

function planMinimizeApp(
  appId: string,
  state: UniversalState,
  rationale: string,
): AgentPlan {
  const app = listApps().find((a) => a.id === appId);
  if (!app) {
    return { action: "noop", rationale: `Unknown app ${appId}` };
  }
  if (!state.windows[app.windowId]) {
    return { action: "noop", rationale: `${app.title} is not open.` };
  }
  return { action: "minimize_app", app: app.id, rationale };
}

function planMaximizeApp(
  appId: string,
  state: UniversalState,
  rationale: string,
): AgentPlan {
  const app = listApps().find((a) => a.id === appId);
  if (!app) {
    return { action: "noop", rationale: `Unknown app ${appId}` };
  }
  if (!state.windows[app.windowId]) {
    return { action: "noop", rationale: `${app.title} is not open.` };
  }
  return { action: "maximize_app", app: app.id, rationale };
}

function planUnmaximizeApp(
  appId: string,
  state: UniversalState,
  rationale: string,
): AgentPlan {
  const app = listApps().find((a) => a.id === appId);
  if (!app) {
    return { action: "noop", rationale: `Unknown app ${appId}` };
  }
  if (!state.windows[app.windowId]) {
    return { action: "noop", rationale: `${app.title} is not open.` };
  }
  return { action: "unmaximize_app", app: app.id, rationale };
}

function planRestoreApp(
  appId: string,
  state: UniversalState,
  rationale: string,
): AgentPlan {
  const app = listApps().find((a) => a.id === appId);
  if (!app) {
    return { action: "noop", rationale: `Unknown app ${appId}` };
  }
  const win = state.windows[app.windowId];
  if (!win) {
    return { action: "noop", rationale: `${app.title} is not open.` };
  }
  // Minimized-only windows come back via focus (unminimize + raise).
  // Maximized windows still unmaximize (and unminimize if they were hidden);
  // exit-fullscreen stays on that path.
  if (win.minimized && !win.maximized) {
    return { action: "focus_app", app: app.id, rationale };
  }
  return { action: "unmaximize_app", app: app.id, rationale };
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

  if (isCloseIntent(lower)) {
    for (const app of listApps()) {
      if (mentionsApp(lower, app)) {
        return planCloseApp(app.id, state, text);
      }
    }
    const focusedId = state.focus?.windowId;
    if (focusedId) {
      const focused = listApps().find((app) => app.windowId === focusedId);
      if (focused) return planCloseApp(focused.id, state, text);
    }
    return { action: "noop", rationale: `Nothing to close: ${text}` };
  }

  if (isMinimizeIntent(lower)) {
    for (const app of listApps()) {
      if (mentionsApp(lower, app)) {
        return planMinimizeApp(app.id, state, text);
      }
    }
    const focusedId = state.focus?.windowId;
    if (focusedId) {
      const focused = listApps().find((app) => app.windowId === focusedId);
      if (focused) return planMinimizeApp(focused.id, state, text);
    }
    return { action: "noop", rationale: `Nothing to minimize: ${text}` };
  }

  if (isRestoreIntent(lower)) {
    for (const app of listApps()) {
      if (mentionsApp(lower, app)) {
        return planRestoreApp(app.id, state, text);
      }
    }
    const focusedId = state.focus?.windowId;
    if (focusedId) {
      const focused = listApps().find((app) => app.windowId === focusedId);
      if (focused) return planRestoreApp(focused.id, state, text);
    }
    return { action: "noop", rationale: `Nothing to restore: ${text}` };
  }

  if (isUnmaximizeIntent(lower)) {
    for (const app of listApps()) {
      if (mentionsApp(lower, app)) {
        return planUnmaximizeApp(app.id, state, text);
      }
    }
    const focusedId = state.focus?.windowId;
    if (focusedId) {
      const focused = listApps().find((app) => app.windowId === focusedId);
      if (focused) return planUnmaximizeApp(focused.id, state, text);
    }
    return { action: "noop", rationale: `Nothing to restore: ${text}` };
  }

  if (isMaximizeIntent(lower)) {
    for (const app of listApps()) {
      if (mentionsApp(lower, app)) {
        return planMaximizeApp(app.id, state, text);
      }
    }
    const focusedId = state.focus?.windowId;
    if (focusedId) {
      const focused = listApps().find((app) => app.windowId === focusedId);
      if (focused) return planMaximizeApp(focused.id, state, text);
    }
    return { action: "noop", rationale: `Nothing to maximize: ${text}` };
  }

  for (const app of listApps()) {
    if (mentionsApp(lower, app)) {
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
