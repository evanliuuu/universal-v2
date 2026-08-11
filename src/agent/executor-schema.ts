import { z } from "zod";
import { JsonPatchOpSchema } from "../protocol/types";

/** Structured patch payload from the live executor model. */
export const ExecutorPatchSchema = z.object({
  statePatch: z.array(JsonPatchOpSchema).default([]),
  uiPatch: z.array(JsonPatchOpSchema).default([]),
  rationale: z.string().optional(),
});

export type ExecutorPatch = z.infer<typeof ExecutorPatchSchema>;

export const LIVE_EXECUTOR_ACTIONS = ["open_app", "set_theme"] as const;

export type LiveExecutorAction = (typeof LIVE_EXECUTOR_ACTIONS)[number];

export function isLiveExecutorAction(
  action: string,
): action is LiveExecutorAction {
  return (LIVE_EXECUTOR_ACTIONS as readonly string[]).includes(action);
}
