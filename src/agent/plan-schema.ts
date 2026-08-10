import { z } from "zod";

export const AgentPlanSchema = z.object({
  action: z.enum(["open_app", "focus_app", "set_theme", "set_budget", "noop"]),
  app: z.enum(["calendar", "notes", "settings"]).optional(),
  theme: z.string().optional(),
  tokenLimit: z.number().optional(),
  rationale: z.string(),
});
