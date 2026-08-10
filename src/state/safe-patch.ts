import {
  applyStatePatch,
  applyUiPatch,
  cloneDocument,
  UniversalDocument,
} from "./patch";
import { JsonPatchOp } from "../protocol/types";

export type PatchResult =
  | { ok: true; doc: UniversalDocument }
  | { ok: false; error: string; doc: UniversalDocument };

export function safeApplyPatches(
  doc: UniversalDocument,
  statePatch: JsonPatchOp[],
  uiPatch: JsonPatchOp[],
): PatchResult {
  const snapshot = cloneDocument(doc);
  try {
    let next = cloneDocument(doc);
    if (statePatch.length) next = applyStatePatch(next, statePatch);
    if (uiPatch.length) next = applyUiPatch(next, uiPatch);
    return { ok: true, doc: next };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      doc: snapshot,
    };
  }
}
