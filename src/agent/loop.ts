import {
  AgentResponse,
  ModelTier,
  SemanticEvent,
  UniversalState,
} from "../protocol/types";
import {
  applyModelExecutorOutput,
  executeLive,
} from "./executor-live";
import { executePlan } from "./executor";
import { isLiveExecutorAction } from "./executor-schema";
import { planMock } from "./planner";
import { planLive } from "./planner-live";
import { routeModelTier } from "./router";

export type AgentMode = "mock" | "openrouter" | "live-fixture";

export async function runAgent(opts: {
  mode: AgentMode;
  modelTier: ModelTier;
  state: UniversalState;
  event: SemanticEvent;
  /** Canned model patch payload for live-fixture evals. */
  modelPatches?: unknown;
}): Promise<AgentResponse> {
  if (opts.mode === "live-fixture") {
    return runLiveFixtureAgent(opts.state, opts.event, opts.modelTier, opts.modelPatches);
  }
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

  if (isLiveExecutorAction(plan.action)) {
    const live = await executeLive(plan, state, event);
    if (live) {
      return {
        ...live.response,
        rationale: `[live planner→${live.source} executor] ${live.response.rationale ?? plan.rationale}`,
      };
    }
  }

  const response = executePlan(plan, state);
  return {
    ...response,
    rationale: `[live planner→executor] ${response.rationale ?? plan.rationale}`,
  };
}

function runLiveFixtureAgent(
  state: UniversalState,
  event: SemanticEvent,
  modelTier: ModelTier,
  modelPatches: unknown,
): AgentResponse {
  if (modelTier === "fast") {
    const plan = planMock(state, event);
    if (plan.action === "focus_app") {
      return executePlan(plan, state);
    }
  }

  const plan = planMock(state, event);
  if (!isLiveExecutorAction(plan.action)) {
    const response = executePlan(plan, state);
    return {
      ...response,
      rationale: `[live-fixture planner→executor] ${response.rationale ?? plan.rationale}`,
    };
  }

  const applied = applyModelExecutorOutput(modelPatches ?? {}, plan, state);
  return {
    ...applied.response,
    rationale: `[live-fixture→${applied.source} executor] ${applied.response.rationale ?? plan.rationale}`,
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
