import { z } from "zod";
import { JsonPatchOpSchema } from "./types";

/** AG-UI-inspired wire messages between host runtime and viewport/agent. */
export const AgUiMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("STATE_SNAPSHOT"),
    sessionId: z.string(),
    seq: z.number(),
    state: z.unknown(),
    ui: z.unknown(),
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
    event: z.unknown(),
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
