import { CompiledHandler, JsonPatchOp, SemanticEvent, UniversalState } from "../protocol/types";
import type { UniversalDocument } from "../state/patch";

export type AppPatches = {
  statePatch: JsonPatchOp[];
  uiPatch: JsonPatchOp[];
};

export type AppReflexResult = {
  handled: boolean;
  statePatch: JsonPatchOp[];
  uiPatch: JsonPatchOp[];
};

/** Per-app local event handlers — keeps app logic out of the core runtime. */
export type AppReflex = (
  doc: UniversalDocument,
  event: SemanticEvent,
) => AppReflexResult | null;

/**
 * Declarative app registration.
 * Prefer `open` + optional `reflex` / `handlers` so new apps don't touch core files.
 */
export type AppDefinition = {
  id: string;
  title: string;
  dockId: string;
  windowId: string;
  dockLabel: string;
  dockTitle?: string;
  /** Extra words that match this app in NL instructions. */
  aliases?: string[];
  /** Produce open-window patches from current state. */
  open: (state?: UniversalState) => AppPatches;
  /** Compiled handlers merged into state.handlers when the app opens. */
  handlers?: CompiledHandler[];
  /** App-local reflex reducers. */
  reflex?: AppReflex;
};
