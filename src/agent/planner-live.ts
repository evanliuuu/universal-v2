import { listApps } from "../apps";
import { AgentPlanSchema } from "./plan-schema";
import { SemanticEvent, UniversalState } from "../protocol/types";
import { buildPlannerContext, RecentEventSummary } from "./context-pack";
import { planMock, AgentPlan } from "./planner";
import { readEnv } from "./env";
import { openRouterChat } from "./openrouter";

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
  recentEvents: RecentEventSummary[] = [],
): Promise<AgentPlan> {
  const apiKey = readEnv("VITE_OPENROUTER_API_KEY");
  if (!apiKey) {
    return planMock(state, event);
  }

  const apps = listApps()
    .map((app) => app.id)
    .join("|");
  const system = `You are the PLANNER for a universal desktop runtime. Output JSON only:
{ "action": "open_app"|"focus_app"|"set_theme"|"set_budget"|"noop", "app": "${apps}", "theme": "cupertino"|"dark"|"win95"|"material"|"high-contrast"|"custom", "tokenLimit": number, "rationale": "..." }
Decide intent from the event. Do NOT emit patches.`;

  const result = await openRouterChat({
    apiKey,
    title: "universal-v2-planner",
    model: modelForPlanner(),
    system,
    user: JSON.stringify({
      context: buildPlannerContext(state, recentEvents),
      event,
    }),
  });

  if (!result.ok) {
    return planMock(state, event);
  }

  try {
    const parsed = JSON.parse(result.content);
    const plan = AgentPlanSchema.safeParse(parsed);
    if (plan.success) return plan.data;
  } catch {
    // fall through to mock
  }
  return planMock(state, event);
}
