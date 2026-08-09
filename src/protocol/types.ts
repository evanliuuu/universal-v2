import { z } from "zod";

/** How events for this widget are handled. */
export const BehaviorSchema = z.enum(["local", "agent"]);
export type Behavior = z.infer<typeof BehaviorSchema>;

export const WidgetTypeSchema = z.enum([
  "box",
  "text",
  "button",
  "input",
  "window",
]);
export type WidgetType = z.infer<typeof WidgetTypeSchema>;

export const WidgetNodeSchema: z.ZodType<WidgetNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    type: WidgetTypeSchema,
    props: z.record(z.unknown()).default({}),
    children: z.array(z.string()).optional(),
    behavior: BehaviorSchema.optional(),
  }),
);

export type WidgetNode = {
  id: string;
  type: WidgetType;
  props: Record<string, unknown>;
  children?: string[];
  behavior?: Behavior;
};

export const WindowStateSchema = z.object({
  id: z.string(),
  title: z.string(),
  x: z.number().default(80),
  y: z.number().default(80),
  width: z.number().default(480),
  height: z.number().default(360),
  rootId: z.string(),
  minimized: z.boolean().default(false),
});

export type WindowState = z.infer<typeof WindowStateSchema>;

export const UniversalStateSchema = z.object({
  meta: z.object({
    theme: z.string().default("cupertino"),
    locale: z.string().default("en"),
    version: z.number().default(1),
  }),
  desktop: z.object({
    rootId: z.string(),
    dock: z.array(z.string()).default([]),
  }),
  windows: z.record(WindowStateSchema).default({}),
  widgets: z.record(WidgetNodeSchema),
  focus: z
    .object({
      windowId: z.string().optional(),
      widgetId: z.string().optional(),
    })
    .optional(),
  apps: z.record(z.unknown()).default({}),
});

export type UniversalState = z.infer<typeof UniversalStateSchema>;

export const SemanticEventSchema = z.object({
  type: z.enum([
    "click",
    "input",
    "submit",
    "instruction",
    "open_app",
    "close_window",
  ]),
  targetId: z.string().optional(),
  value: z.unknown().optional(),
  at: z.string(),
});

export type SemanticEvent = z.infer<typeof SemanticEventSchema>;

export const JsonPatchOpSchema = z.object({
  op: z.enum(["add", "remove", "replace", "move", "copy", "test"]),
  path: z.string(),
  value: z.unknown().optional(),
  from: z.string().optional(),
});

export type JsonPatchOp = z.infer<typeof JsonPatchOpSchema>;

export const AgentResponseSchema = z.object({
  statePatch: z.array(JsonPatchOpSchema).default([]),
  uiPatch: z.array(JsonPatchOpSchema).default([]),
  rationale: z.string().optional(),
});

export type AgentResponse = z.infer<typeof AgentResponseSchema>;

export type PatchTarget = "state" | "ui";

export type AppliedPatch = {
  target: PatchTarget;
  ops: JsonPatchOp[];
};

export type EventLogEntry = {
  id: number;
  event: SemanticEvent;
  tier: "reflex" | "compiled" | "agent";
  patches: AppliedPatch[];
  latencyMs?: number;
};
