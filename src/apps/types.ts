import { CompiledHandler, JsonPatchOp, UniversalState } from "../protocol/types";

export type AppPatches = {
  statePatch: JsonPatchOp[];
  uiPatch: JsonPatchOp[];
};

/** Declarative app registration — add apps without editing the runtime core. */
export type AppDefinition = {
  id: string;
  title: string;
  dockId: string;
  windowId: string;
  dockLabel: string;
  dockTitle?: string;
  /** Produce open-window patches from current state. */
  open: (state?: UniversalState) => AppPatches;
  handlers?: CompiledHandler[];
};
