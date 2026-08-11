import jsonpatch from "fast-json-patch";
import type { Operation } from "fast-json-patch";
import {
  AgentResponseSchema,
  JsonPatchOp,
  UniversalState,
  UniversalStateSchema,
  WidgetNode,
} from "../protocol/types";

const { applyPatch } = jsonpatch;

export type UniversalDocument = {
  state: UniversalState;
  /** UI tree is a projection of state.widgets; kept separate for AG-UI-style deltas. */
  ui: {
    rootId: string;
    widgets: Record<string, WidgetNode>;
  };
};

export function createDocument(state: UniversalState): UniversalDocument {
  return {
    state,
    ui: {
      rootId: state.desktop.rootId,
      widgets: { ...state.widgets },
    },
  };
}

export function syncUiFromState(doc: UniversalDocument): void {
  doc.ui.rootId = doc.state.desktop.rootId;
  doc.ui.widgets = { ...doc.state.widgets };
}

export function applyJsonPatch<T extends object>(
  target: T,
  ops: JsonPatchOp[],
): T {
  if (ops.length === 0) return target;
  const result = applyPatch(
    target,
    ops as Operation[],
    /* validate */ true,
    /* mutate */ false,
  ).newDocument;
  return result as T;
}

export function applyStatePatch(
  doc: UniversalDocument,
  ops: JsonPatchOp[],
): UniversalDocument {
  doc.state = UniversalStateSchema.parse(
    applyJsonPatch(doc.state, ops),
  );
  syncUiFromState(doc);
  return doc;
}

export function applyUiPatch(
  doc: UniversalDocument,
  ops: JsonPatchOp[],
): UniversalDocument {
  doc.ui = applyJsonPatch(doc.ui, ops);
  // Mirror widget changes back into canonical state
  doc.state.widgets = { ...doc.ui.widgets };
  doc.state.desktop.rootId = doc.ui.rootId;
  return doc;
}

export function parseAgentResponse(raw: unknown) {
  return AgentResponseSchema.parse(raw);
}

export function cloneDocument(doc: UniversalDocument): UniversalDocument {
  return structuredClone(doc);
}
