import { z } from "zod";

export const JsonPatchOpSchema = z.object({
  op: z.enum(["add", "remove", "replace", "move", "copy", "test"]),
  path: z.string(),
  value: z.unknown().optional(),
  from: z.string().optional(),
});

export type JsonPatchOp = z.infer<typeof JsonPatchOpSchema>;

/** How events for this widget are handled. */
export const BehaviorSchema = z.enum(["local", "compiled", "agent"]);
export type Behavior = z.infer<typeof BehaviorSchema>;

export const CompiledHandlerSchema = z.object({
  match: z.object({
    type: z.string(),
    targetId: z.string().optional(),
  }),
  /** JS expression evaluated as `new Function('state', 'return (' + when + ')')` */
  when: z.string().optional(),
  statePatch: z.array(JsonPatchOpSchema).optional(),
  uiPatch: z.array(JsonPatchOpSchema).optional(),
  /** JS body: `(state, event) => ({ statePatch, uiPatch })` */
  source: z.string().optional(),
});

export type CompiledHandler = z.infer<typeof CompiledHandlerSchema>;

export const ModelTierSchema = z.enum(["fast", "big"]);
export type ModelTier = z.infer<typeof ModelTierSchema>;

export const ExecutionTierSchema = z.enum([
  "reflex",
  "compiled",
  "prefetch",
  "agent-fast",
  "agent-big",
]);
export type ExecutionTier = z.infer<typeof ExecutionTierSchema>;

export const WidgetTypeSchema = z.enum([
  "box",
  "text",
  "label",
  "button",
  "input",
  "list",
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
    budget: z
      .object({
        tokensUsed: z.number().default(0),
        tokenLimit: z.number().default(50_000),
        prefetchEnabled: z.boolean().default(true),
        maxPrefetchPending: z.number().default(4),
      })
      .default({}),
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
  handlers: z.record(CompiledHandlerSchema).default({}),
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
  seq: number;
  event: SemanticEvent;
  tier: ExecutionTier;
  modelTier?: ModelTier;
  prefetchHit?: boolean;
  patches: AppliedPatch[];
  latencyMs?: number;
};
