import { JsonPatchOp, SemanticEvent, UniversalState } from "../protocol/types";
import { UniversalDocument } from "../state/patch";
import { ReflexResult } from "./reflex";

function evalWhen(state: UniversalState, when: string): boolean {
  try {
    const fn = new Function("state", `return (${when});`);
    return Boolean(fn(state));
  } catch {
    return false;
  }
}

function runHandlerSource(
  state: UniversalState,
  event: SemanticEvent,
  source: string,
): { statePatch: JsonPatchOp[]; uiPatch: JsonPatchOp[] } {
  const fn = new Function("state", "event", source);
  const result = fn(state, event);
  return {
    statePatch: result?.statePatch ?? [],
    uiPatch: result?.uiPatch ?? [],
  };
}

/** Compiled tier — static or JIT handlers stored in state.handlers. */
export function tryCompiled(
  doc: UniversalDocument,
  event: SemanticEvent,
): ReflexResult {
  const empty: ReflexResult = { handled: false, statePatch: [], uiPatch: [] };
  const handlers = doc.state.handlers ?? {};

  for (const handler of Object.values(handlers)) {
    if (handler.match.type !== event.type) continue;
    if (handler.match.targetId && handler.match.targetId !== event.targetId) {
      continue;
    }
    if (handler.when && !evalWhen(doc.state, handler.when)) continue;

    if (handler.source) {
      const result = runHandlerSource(doc.state, event, handler.source);
      return { handled: true, ...result };
    }

    return {
      handled: true,
      statePatch: handler.statePatch ?? [],
      uiPatch: handler.uiPatch ?? [],
    };
  }

  return empty;
}
