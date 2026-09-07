import { AgUiMessageSchema } from "./messages";
import { JsonPatchOp } from "./types";
import { UniversalDocument } from "../state/patch";

export type AgUiMessage = import("./messages").AgUiMessage;

export function parseAgUiMessage(raw: unknown): AgUiMessage | null {
  const result = AgUiMessageSchema.safeParse(raw);
  return result.success ? result.data : null;
}

export function encodeStateSnapshot(
  sessionId: string,
  seq: number,
  document: UniversalDocument,
) {
  return {
    type: "STATE_SNAPSHOT" as const,
    sessionId,
    seq,
    state: document.state,
    ui: document.ui,
  };
}

export function encodeStateDelta(
  sessionId: string,
  seq: number,
  patch: JsonPatchOp[],
) {
  return {
    type: "STATE_DELTA" as const,
    sessionId,
    seq,
    patch,
  };
}

export function encodeUiDelta(
  sessionId: string,
  seq: number,
  patch: JsonPatchOp[],
) {
  return {
    type: "UI_DELTA" as const,
    sessionId,
    seq,
    patch,
  };
}

export function encodeEvent(sessionId: string, event: unknown) {
  return {
    type: "EVENT" as const,
    sessionId,
    event,
  };
}

export function encodeRunFinished(
  sessionId: string,
  seq: number,
  tier: string,
  latencyMs: number,
) {
  return {
    type: "RUN_FINISHED" as const,
    sessionId,
    seq,
    tier,
    latencyMs,
  };
}
