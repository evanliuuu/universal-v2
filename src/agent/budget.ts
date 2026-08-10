import { JsonPatchOp, UniversalState } from "../protocol/types";

export type SessionBudget = {
  tokensUsed: number;
  tokenLimit: number;
  prefetchEnabled: boolean;
  maxPrefetchPending: number;
};

export const DEFAULT_BUDGET: SessionBudget = {
  tokensUsed: 0,
  tokenLimit: 50_000,
  prefetchEnabled: true,
  maxPrefetchPending: 4,
};

export function getBudget(state: UniversalState): SessionBudget {
  const raw = state.meta.budget as SessionBudget | undefined;
  return { ...DEFAULT_BUDGET, ...raw };
}

export function estimateTokens(ops: JsonPatchOp[]): number {
  if (!ops.length) return 0;
  return Math.max(1, Math.ceil(JSON.stringify(ops).length / 4));
}

export function canRunAgent(state: UniversalState, estimated = 500): boolean {
  const budget = getBudget(state);
  return budget.tokensUsed + estimated <= budget.tokenLimit;
}

export function canPrefetch(state: UniversalState, pending: number): boolean {
  const budget = getBudget(state);
  if (!budget.prefetchEnabled) return false;
  if (pending >= budget.maxPrefetchPending) return false;
  return budget.tokensUsed + 200 <= budget.tokenLimit;
}

export function chargeTokensPatch(
  state: UniversalState,
  tokens: number,
): JsonPatchOp {
  const budget = getBudget(state);
  return {
    op: "replace",
    path: "/meta/budget/tokensUsed",
    value: budget.tokensUsed + tokens,
  };
}
