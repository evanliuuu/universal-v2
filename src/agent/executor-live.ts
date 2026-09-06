import {
  AgentResponse,
  SemanticEvent,
  UniversalState,
} from "../protocol/types";
import { createDocument } from "../state/patch";
import { safeApplyPatches } from "../state/safe-patch";
import { readEnv } from "./env";
import { executePlan } from "./executor";
import {
  ExecutorPatchSchema,
  isLiveExecutorAction,
} from "./executor-schema";
import { AgentPlan } from "./planner";

function modelForExecutor(): string {
  return (
    readEnv("VITE_OPENROUTER_EXECUTOR_MODEL") ??
    readEnv("VITE_OPENROUTER_BIG_MODEL") ??
    "anthropic/claude-sonnet-4"
  );
}

function summarize(state: UniversalState) {
  return {
    theme: state.meta.theme,
    openWindows: Object.keys(state.windows),
    dock: state.desktop.dock,
    budget: state.meta.budget,
    focus: state.focus,
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

  return {
    response: {
      statePatch: candidate.statePatch,
      uiPatch: candidate.uiPatch,
      rationale: candidate.rationale ?? plan.rationale,
    },
    source: "live",
  };
}

/** Live executor: model emits validated patch ops for open_app / focus_app / set_theme / set_budget. */
export async function executeLive(
  plan: AgentPlan,
  state: UniversalState,
  event: SemanticEvent,
): Promise<{ response: AgentResponse; source: "live" | "fallback"; error?: string } | null> {
  if (!isLiveExecutorAction(plan.action)) return null;

  const apiKey = readEnv("VITE_OPENROUTER_API_KEY");
  if (!apiKey) return null;

  const system = `You are the EXECUTOR for a universal desktop runtime.
Given a plan, emit JSON Patch ops only (RFC 6902). Output JSON only:
{ "statePatch": [...], "uiPatch": [...], "rationale": "..." }
Rules:
- For set_theme: replace /meta/theme with "cupertino"|"dark"|"win95"
- For set_budget: replace /meta/budget/tokenLimit with the plan's tokenLimit
- For focus_app: replace /focus with { "windowId": "win-<app>", "widgetId": "dock-<app>" }
- For open_app: add /windows/win-<app>, related /widgets/*, desktop children, /focus, /apps/<app>
- Prefer small valid patches. Do not invent widget types outside: box, text, label, button, input, list, tabs, table, form, checkbox, window
- uiPatch may be [] if widgets are included in statePatch`;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:5174",
        "X-Title": "universal-v2-executor",
      },
      body: JSON.stringify({
        model: modelForExecutor(),
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: JSON.stringify({
              plan,
              state: summarize(state),
              event,
            }),
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      return {
        response: executePlan(plan, state),
        source: "fallback",
        error: `openrouter ${res.status}`,
      };
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? "{}";
    const raw = typeof content === "string" ? JSON.parse(content) : content;
    return applyModelExecutorOutput(raw, plan, state);
  } catch (error) {
    return {
      response: executePlan(plan, state),
      source: "fallback",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
