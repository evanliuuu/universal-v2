import {
  AgentResponse,
  SemanticEvent,
  UniversalState,
} from "../protocol/types";
import { createDocument } from "../state/patch";
import { safeApplyPatches } from "../state/safe-patch";
import { buildPlannerContext, RecentEventSummary } from "./context-pack";
import { readEnv } from "./env";
import { executePlan } from "./executor";
import {
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
- set_theme: replace /meta/theme with "cupertino"|"dark"|"win95"|"material"|"high-contrast"
- set_budget: replace /meta/budget/tokenLimit with a positive number
- focus_app: replace /focus with { windowId: "win-<app>", widgetId: "dock-<app>" }
- open_app: add /windows/win-<app>, related /widgets/*, desktop children, /focus, /apps/<app>
- Prefer small valid patches. Widget types: box, text, label, button, input, list, tabs, table, form, checkbox, window
- uiPatch may be [] if widgets are included in statePatch`;
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

  return {
    response: {
      statePatch: candidate.statePatch,
      uiPatch: candidate.uiPatch,
      rationale: candidate.rationale ?? plan.rationale,
    },
    source: "live",
  };
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
