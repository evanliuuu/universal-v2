import { getApp } from "../apps";
import {
  AgentResponse,
  SemanticEvent,
  UniversalState,
} from "../protocol/types";
import { closeWindowPatches } from "../runtime/close-window";
import { createDocument } from "../state/patch";
import { safeApplyPatches } from "../state/safe-patch";
import { buildPlannerContext, RecentEventSummary } from "./context-pack";
import { readEnv } from "./env";
import { executePlan } from "./executor";
import {
  ExecutorPatch,
  ExecutorPatchSchema,
  isLiveExecutorAction,
} from "./executor-schema";
import { openRouterChat } from "./openrouter";
import { AgentPlan } from "./planner";

function modelForExecutor(): string {
  return (
    readEnv("VITE_OPENROUTER_EXECUTOR_MODEL") ??
    readEnv("VITE_OPENROUTER_BIG_MODEL") ??
    "anthropic/claude-sonnet-4"
  );
}

function executorSystemPrompt(): string {
  return `You are the EXECUTOR for a universal desktop runtime.
Given a plan, emit JSON Patch ops only (RFC 6902). Output JSON only:
{ "statePatch": [...], "uiPatch": [...], "rationale": "..." }
Rules:
- set_theme: replace /meta/theme with "cupertino"|"dark"|"win95"|"material"|"high-contrast"|"custom"
- optional theme accents: replace /meta/themeVars with { "--uw-accent": "#hex" } when using custom
- set_budget: replace /meta/budget/tokenLimit with a positive number
- focus_app: replace /focus with { windowId: "win-<app>", widgetId: "dock-<app>" }; if that window is minimized, also replace /windows/win-<app>/minimized with false
- minimize_app: replace /windows/win-<app>/minimized with true
- maximize_app: replace /windows/win-<app>/maximized with true; if that window is minimized, also replace /windows/win-<app>/minimized with false
- unmaximize_app: replace /windows/win-<app>/maximized with false; if that window is minimized, also replace /windows/win-<app>/minimized with false
- close_app: remove /windows/win-<app>, drop the window root from /widgets/desktop/children, remove /widgets/<rootId> and its nested widgets, remove /apps/<app>, remove /handlers/focus-<app> and /handlers/<app>-*, and clear /focus.windowId if it pointed at that window
- open_app: add /windows/win-<app>, related /widgets/*, desktop children, /focus, /apps/<app>
- Prefer small valid patches. Widget types: box, text, label, button, input, list, tabs, table, form, checkbox, select, slider, divider, scroll-area, menu, dialog, icon, image, window
- uiPatch may be [] if widgets are included in statePatch`;
}

function foldMissingLocalOps(
  candidate: ExecutorPatch,
  local: ExecutorPatch["statePatch"],
): ExecutorPatch {
  const existing = new Set(candidate.statePatch.map((op) => op.path));
  const extras = local.filter((op) => !existing.has(op.path));
  if (extras.length === 0) return candidate;
  return {
    ...candidate,
    statePatch: [...candidate.statePatch, ...extras],
  };
}

/**
 * Fold local close teardown into a live close_app patch when the model
 * drops the window but leaves apps, nested widgets, or handlers behind.
 */
function mergeCloseTeardown(
  plan: AgentPlan,
  state: UniversalState,
  candidate: ExecutorPatch,
): ExecutorPatch {
  if (plan.action !== "close_app" || !plan.app) return candidate;
  const app = getApp(plan.app);
  if (!app) return candidate;
  const local = closeWindowPatches(state, app.windowId);
  if (!local) return candidate;
  return foldMissingLocalOps(candidate, local);
}

/**
 * Fold local unminimize into a live maximize_app patch when the model
 * only sets maximized and leaves a hidden window minimized.
 */
function mergeMaximizeUnminimize(
  plan: AgentPlan,
  state: UniversalState,
  candidate: ExecutorPatch,
): ExecutorPatch {
  if (plan.action !== "maximize_app" || !plan.app) return candidate;
  const app = getApp(plan.app);
  if (!app) return candidate;
  if (!state.windows[app.windowId]?.minimized) return candidate;
  return foldMissingLocalOps(candidate, executePlan(plan, state).statePatch);
}

/**
 * Fold local unminimize into a live focus_app patch when the model
 * only sets /focus and leaves a hidden window minimized.
 */
function mergeFocusUnminimize(
  plan: AgentPlan,
  state: UniversalState,
  candidate: ExecutorPatch,
): ExecutorPatch {
  if (plan.action !== "focus_app" || !plan.app) return candidate;
  const app = getApp(plan.app);
  if (!app) return candidate;
  if (!state.windows[app.windowId]?.minimized) return candidate;
  return foldMissingLocalOps(candidate, executePlan(plan, state).statePatch);
}

function liveResponse(
  candidate: ExecutorPatch,
  plan: AgentPlan,
): AgentResponse {
  return {
    statePatch: candidate.statePatch,
    uiPatch: candidate.uiPatch,
    rationale: candidate.rationale ?? plan.rationale,
  };
}

/**
 * Validate model-emitted patches. On schema or apply failure, fall back to
 * the local template executor.
 */
export function applyModelExecutorOutput(
  raw: unknown,
  plan: AgentPlan,
  state: UniversalState,
): { response: AgentResponse; source: "live" | "fallback"; error?: string } {
  const parsed = ExecutorPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      response: executePlan(plan, state),
      source: "fallback",
      error: parsed.error.message,
    };
  }

  const candidate = parsed.data;
  const dryRun = safeApplyPatches(
    createDocument(structuredClone(state)),
    candidate.statePatch,
    candidate.uiPatch,
  );
  if (!dryRun.ok) {
    return {
      response: executePlan(plan, state),
      source: "fallback",
      error: dryRun.error,
    };
  }

  const merged = mergeFocusUnminimize(
    plan,
    state,
    mergeMaximizeUnminimize(
      plan,
      state,
      mergeCloseTeardown(plan, state, candidate),
    ),
  );
  if (merged !== candidate) {
    const mergedRun = safeApplyPatches(
      createDocument(structuredClone(state)),
      merged.statePatch,
      merged.uiPatch,
    );
    if (!mergedRun.ok) {
      return {
        response: executePlan(plan, state),
        source: "fallback",
        error: mergedRun.error,
      };
    }
    return { response: liveResponse(merged, plan), source: "live" };
  }

  return { response: liveResponse(candidate, plan), source: "live" };
}

/** Live executor: model emits validated patch ops for supported plan actions. */
export async function executeLive(
  plan: AgentPlan,
  state: UniversalState,
  event: SemanticEvent,
  recentEvents: RecentEventSummary[] = [],
): Promise<{ response: AgentResponse; source: "live" | "fallback"; error?: string } | null> {
  if (!isLiveExecutorAction(plan.action)) return null;

  const apiKey = readEnv("VITE_OPENROUTER_API_KEY");
  if (!apiKey) return null;

  try {
    const result = await openRouterChat({
      apiKey,
      title: "universal-v2-executor",
      model: modelForExecutor(),
      system: executorSystemPrompt(),
      user: JSON.stringify({
        plan,
        context: buildPlannerContext(state, recentEvents),
        event,
      }),
    });

    if (!result.ok) {
      return {
        response: executePlan(plan, state),
        source: "fallback",
        error: `openrouter ${result.status}`,
      };
    }

    const raw = JSON.parse(result.content);
    return applyModelExecutorOutput(raw, plan, state);
  } catch (error) {
    return {
      response: executePlan(plan, state),
      source: "fallback",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
