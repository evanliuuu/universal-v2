import { z } from "zod";
import { AppliedPatch, JsonPatchOp, JsonPatchOpSchema } from "./types";

/** z.unknown() treats a missing key as valid; snapshots/events need the field present. */
const requiredJson = z.custom<unknown>(
  (val) => val !== undefined,
  { message: "Required" },
);

/** AG-UI-inspired wire messages between host runtime and viewport/agent. */
export const AgUiMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("STATE_SNAPSHOT"),
    sessionId: z.string(),
    seq: z.number(),
    state: requiredJson,
    ui: requiredJson,
  }),
  z.object({
    type: z.literal("STATE_DELTA"),
    sessionId: z.string(),
    seq: z.number(),
    patch: z.array(JsonPatchOpSchema),
  }),
  z.object({
    type: z.literal("UI_DELTA"),
    sessionId: z.string(),
    seq: z.number(),
    patch: z.array(JsonPatchOpSchema),
  }),
  z.object({
    type: z.literal("EVENT"),
    sessionId: z.string(),
    event: requiredJson,
  }),
  z.object({
    type: z.literal("PREFETCH_HIT"),
    sessionId: z.string(),
    key: z.string(),
    latencyMs: z.number(),
  }),
  z.object({
    type: z.literal("RUN_FINISHED"),
    sessionId: z.string(),
    seq: z.number(),
    tier: z.string(),
    latencyMs: z.number(),
  }),
]);

export type AgUiMessage = z.infer<typeof AgUiMessageSchema>;

export function eventKey(event: { type: string; targetId?: string }): string {
  return `${event.type}:${event.targetId ?? "*"}`;
}

export function parseAgUiMessage(raw: unknown): AgUiMessage | null {
  const parsed = AgUiMessageSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function encodeStateSnapshot(
  sessionId: string,
  seq: number,
  document: { state: unknown; ui: unknown },
): AgUiMessage {
  return AgUiMessageSchema.parse({
    type: "STATE_SNAPSHOT",
    sessionId,
    seq,
    state: document.state,
    ui: document.ui,
  });
}

export function encodeStateDelta(
  sessionId: string,
  seq: number,
  patch: JsonPatchOp[],
): AgUiMessage {
  return AgUiMessageSchema.parse({
    type: "STATE_DELTA",
    sessionId,
    seq,
    patch,
  });
}

export function encodeUiDelta(
  sessionId: string,
  seq: number,
  patch: JsonPatchOp[],
): AgUiMessage {
  return AgUiMessageSchema.parse({
    type: "UI_DELTA",
    sessionId,
    seq,
    patch,
  });
}

export function encodeEvent(sessionId: string, event: unknown): AgUiMessage {
  return AgUiMessageSchema.parse({ type: "EVENT", sessionId, event });
}

export function encodePrefetchHit(
  sessionId: string,
  key: string,
  latencyMs: number,
): AgUiMessage {
  return AgUiMessageSchema.parse({
    type: "PREFETCH_HIT",
    sessionId,
    key,
    latencyMs,
  });
}

export function encodeRunFinished(
  sessionId: string,
  seq: number,
  tier: string,
  latencyMs: number,
): AgUiMessage {
  return AgUiMessageSchema.parse({
    type: "RUN_FINISHED",
    sessionId,
    seq,
    tier,
    latencyMs,
  });
}

export type EncodeDispatchOpts = {
  sessionId: string;
  seq: number;
  event: { type: string; targetId?: string };
  patches: AppliedPatch[];
  tier: string;
  latencyMs: number;
  prefetchHit?: boolean;
};

/** EVENT + optional deltas + optional PREFETCH_HIT + RUN_FINISHED. */
export function encodeDispatch(opts: EncodeDispatchOpts): AgUiMessage[] {
  const messages: AgUiMessage[] = [encodeEvent(opts.sessionId, opts.event)];

  for (const patch of opts.patches) {
    if (!patch.ops.length) continue;
    if (patch.target === "state") {
      messages.push(encodeStateDelta(opts.sessionId, opts.seq, patch.ops));
    } else if (patch.target === "ui") {
      messages.push(encodeUiDelta(opts.sessionId, opts.seq, patch.ops));
    }
  }

  if (opts.prefetchHit) {
    messages.push(
      encodePrefetchHit(opts.sessionId, eventKey(opts.event), opts.latencyMs),
    );
  }

  messages.push(
    encodeRunFinished(opts.sessionId, opts.seq, opts.tier, opts.latencyMs),
  );
  return messages;
}
