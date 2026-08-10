import {
  AgentResponse,
  ModelTier,
  SemanticEvent,
  UniversalState,
} from "../protocol/types";
import { executePlan } from "./executor";
import { planMock } from "./planner";
import { planLive } from "./planner-live";
import { routeModelTier } from "./router";

export type AgentMode = "mock" | "openrouter";

export async function runAgent(opts: {
  mode: AgentMode;
  modelTier: ModelTier;
  state: UniversalState;
  event: SemanticEvent;
}): Promise<AgentResponse> {
  if (opts.mode === "openrouter") {
    return runOpenRouterAgent(opts.state, opts.event, opts.modelTier);
  }
  return mockAgent(opts.state, opts.event, opts.modelTier);
}

async function runOpenRouterAgent(
  state: UniversalState,
  event: SemanticEvent,
  modelTier: ModelTier,
): Promise<AgentResponse> {
  if (modelTier === "fast") {
    const plan = planMock(state, event);
    if (plan.action === "focus_app") {
      return executePlan(plan, state);
    }
  }

  const plan = await planLive(state, event);
  const response = executePlan(plan, state);
  return {
    ...response,
    rationale: `[live planner→executor] ${response.rationale ?? plan.rationale}`,
  };
}

function mockAgent(
  state: UniversalState,
  event: SemanticEvent,
  modelTier: ModelTier,
): AgentResponse {
  if (modelTier === "fast") {
    const plan = planMock(state, event);
    if (plan.action === "focus_app") {
      return executePlan(plan, state);
    }
  }

  const plan = planMock(state, event);
  const response = executePlan(plan, state);
  return {
    ...response,
    rationale: `[planner→executor ${modelTier}] ${response.rationale ?? plan.rationale}`,
  };
}

export async function prefetchAgent(
  mode: AgentMode,
  state: UniversalState,
  event: SemanticEvent,
): Promise<AgentResponse> {
  const modelTier = routeModelTier(event, state);
  return runAgent({ mode, modelTier, state, event });
}
