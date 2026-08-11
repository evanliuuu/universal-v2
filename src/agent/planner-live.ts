import { AgentPlanSchema } from "./plan-schema";
import { SemanticEvent, UniversalState } from "../protocol/types";
import { planMock, AgentPlan } from "./planner";
import { readEnv } from "./env";

function modelForPlanner(): string {
  return (
    readEnv("VITE_OPENROUTER_PLANNER_MODEL") ??
    readEnv("VITE_OPENROUTER_BIG_MODEL") ??
    "anthropic/claude-sonnet-4"
  );
}

/** Live planner: ask the model for a structured plan only (no patches). */
export async function planLive(
  state: UniversalState,
  event: SemanticEvent,
): Promise<AgentPlan> {
  const apiKey = readEnv("VITE_OPENROUTER_API_KEY");
  if (!apiKey) {
    return planMock(state, event);
  }

  const system = `You are the PLANNER for a universal desktop runtime. Output JSON only:
{ "action": "open_app"|"focus_app"|"set_theme"|"set_budget"|"noop", "app": "calendar"|"notes"|"settings", "theme": "cupertino"|"dark"|"win95", "tokenLimit": number, "rationale": "..." }
Decide intent from the event. Do NOT emit patches.`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:5174",
      "X-Title": "universal-v2-planner",
    },
    body: JSON.stringify({
      model: modelForPlanner(),
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify({ state: summarize(state), event }) },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    return planMock(state, event);
  }

  const data = await res.json();
  const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
  const result = AgentPlanSchema.safeParse(parsed);
  if (result.success) return result.data;
  return planMock(state, event);
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
