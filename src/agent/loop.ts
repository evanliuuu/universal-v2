import {
  AgentResponse,
  ModelTier,
  SemanticEvent,
  UniversalState,
} from "../protocol/types";
import { executePlan } from "./executor";
import { planMock } from "./planner";

export type AgentMode = "mock" | "openrouter";

export async function runAgent(opts: {
  mode: AgentMode;
  modelTier: ModelTier;
  state: UniversalState;
  event: SemanticEvent;
}): Promise<AgentResponse> {
  if (opts.mode === "openrouter") {
    return callOpenRouter(opts.state, opts.event, opts.modelTier);
  }
  return mockAgent(opts.state, opts.event, opts.modelTier);
}

function mockAgent(
  state: UniversalState,
  event: SemanticEvent,
  modelTier: ModelTier,
): AgentResponse {
  if (modelTier === "fast") {
    const plan = planMock(state, event);
    if (plan.action === "focus_app") {
      return executePlan(plan);
    }
  }

  const plan = planMock(state, event);
  const response = executePlan(plan);
  return {
    ...response,
    rationale: `[planner→executor ${modelTier}] ${response.rationale ?? plan.rationale}`,
  };
}

function modelForTier(tier: ModelTier): string {
  if (tier === "fast") {
    return (
      (import.meta.env.VITE_OPENROUTER_FAST_MODEL as string | undefined) ??
      "google/gemini-2.5-flash"
    );
  }
  return (
    (import.meta.env.VITE_OPENROUTER_BIG_MODEL as string | undefined) ??
    "anthropic/claude-sonnet-4"
  );
}

async function callOpenRouter(
  state: UniversalState,
  event: SemanticEvent,
  modelTier: ModelTier,
): Promise<AgentResponse> {
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined;
  if (!apiKey) {
    throw new Error("Set VITE_OPENROUTER_API_KEY in .env for OpenRouter mode");
  }

  const system = `You are the universal program EXECUTOR (${modelTier} tier). Given a plan or event, respond with JSON only:
{ "statePatch": [...RFC6902 ops on state...], "uiPatch": [...ops on ui.widgets...], "rationale": "..." }
Widget types: box, text, label, button, input, list, tabs, table, form, window.
Emit deltas (JSON Patch), never full HTML. Prefer minimal patches.`;

  const plan = planMock(state, event);
  const user = JSON.stringify({ state, event, modelTier, plan }, null, 2);

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:5174",
      "X-Title": "universal-v2",
    },
    body: JSON.stringify({
      model: modelForTier(modelTier),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${err}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  const parsed = JSON.parse(content);
  return {
    statePatch: parsed.statePatch ?? [],
    uiPatch: parsed.uiPatch ?? [],
    rationale: parsed.rationale,
  };
}

export function prefetchAgent(
  mode: AgentMode,
  state: UniversalState,
  event: SemanticEvent,
): Promise<AgentResponse> {
  const modelTier = state.windows[`win-${event.targetId?.replace("dock-", "") ?? ""}`]
    ? "fast"
    : "big";
  return runAgent({ mode, modelTier, state, event });
}
