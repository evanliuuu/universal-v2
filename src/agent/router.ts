import { ModelTier, SemanticEvent, UniversalState } from "../protocol/types";

/** Route events to fast (routine) or big (structural) model tiers. */
export function routeModelTier(
  event: SemanticEvent,
  state: UniversalState,
): ModelTier {
  if (event.type === "instruction" || event.type === "open_app") {
    return "big";
  }

  if (event.type === "click" && event.targetId?.startsWith("dock-")) {
    const app = event.targetId.replace("dock-", "");
    const winId = `win-${app}`;
    if (state.windows[winId]) return "fast";
    return "big";
  }

  if (event.type === "submit") return "fast";

  return "big";
}

export function executionTierForModel(modelTier: ModelTier): "agent-fast" | "agent-big" {
  return modelTier === "fast" ? "agent-fast" : "agent-big";
}
