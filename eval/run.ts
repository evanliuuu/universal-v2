import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AgentMode, runAgent } from "../src/agent/loop";
import { setOpenRouterChat } from "../src/agent/openrouter";
import { routeModelTier, executionTierForModel } from "../src/agent/router";
import { tryCompiled } from "../src/runtime/compiled";
import { safeApplyPatches } from "../src/state/safe-patch";
import { createDocument } from "../src/state/patch";
import { createSeedState } from "../src/state/seed";
import { tryReflex } from "../src/runtime/reflex";
import { createSemanticEvent } from "../src/state/store";
import { ExecutionTier, SemanticEvent } from "../src/protocol/types";
import { executePlan } from "../src/agent/executor";
import { planMock } from "../src/agent/planner";
import {
  buildPlannerContext,
  RecentEventSummary,
} from "../src/agent/context-pack";

const __dirname = dirname(fileURLToPath(import.meta.url));

type AssertStep = {
  path: string;
  exists?: boolean;
  eq?: unknown;
};

type EvalStep = {
  event: Omit<SemanticEvent, "at">;
  assert: AssertStep;
  expectTier?: ExecutionTier;
  /** Canned model patch payload for agentMode=live-fixture */
  modelPatches?: unknown;
};

type EvalSequence = {
  name: string;
  agentMode?: AgentMode;
  /** Queued JSON bodies for planner then executor OpenRouter calls. */
  mockResponses?: unknown[];
  steps: EvalStep[];
};

function getAtPath(obj: unknown, path: string): unknown {
  const parts = path.replace(/^\//, "").split("/");
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

async function dispatchStep(
  doc: ReturnType<typeof createDocument>,
  event: SemanticEvent,
  agentMode: AgentMode,
  modelPatches?: unknown,
  recentEvents: RecentEventSummary[] = [],
): Promise<{ doc: typeof doc; tier: ExecutionTier }> {
  const reflex = tryReflex(doc, event);
  if (reflex.handled) {
    const result = safeApplyPatches(doc, reflex.statePatch, reflex.uiPatch);
    if (!result.ok) throw new Error(result.error);
    return { doc: result.doc, tier: "reflex" };
  }

  const compiled = tryCompiled(doc, event);
  if (compiled.handled) {
    const result = safeApplyPatches(doc, compiled.statePatch, compiled.uiPatch);
    if (!result.ok) throw new Error(result.error);
    return { doc: result.doc, tier: "compiled" };
  }

  const modelTier = routeModelTier(event, doc.state);
  const response = await runAgent({
    mode: agentMode,
    modelTier,
    state: doc.state,
    event,
    modelPatches,
    recentEvents,
  });
  const result = safeApplyPatches(doc, response.statePatch, response.uiPatch);
  if (!result.ok) throw new Error(result.error);
  return { doc: result.doc, tier: executionTierForModel(modelTier) };
}

async function runSequence(file: string): Promise<boolean> {
  const seq: EvalSequence = JSON.parse(readFileSync(file, "utf-8"));
  let doc = createDocument(createSeedState());
  let passed = 0;
  const agentMode = seq.agentMode ?? "mock";
  const prevKey = process.env.VITE_OPENROUTER_API_KEY;
  const queue = [...(seq.mockResponses ?? [])];
  const recentEvents: RecentEventSummary[] = [];

  if (seq.mockResponses) {
    process.env.VITE_OPENROUTER_API_KEY = "eval-mock";
    setOpenRouterChat(async () => {
      const next = queue.shift();
      if (next === undefined) return { ok: false, status: 503 };
      return { ok: true, content: JSON.stringify(next) };
    });
  }

  console.log(`\n▶ ${seq.name}${agentMode !== "mock" ? ` [${agentMode}]` : ""}`);

  try {
    for (const [i, step] of seq.steps.entries()) {
      const event = createSemanticEvent(step.event);
      const { doc: next, tier } = await dispatchStep(
        doc,
        event,
        agentMode,
        step.modelPatches,
        recentEvents,
      );
      doc = next;
      recentEvents.push({
        type: event.type,
        targetId: event.targetId,
        value: event.value,
      });

      const actual = getAtPath(doc.state, step.assert.path);
      let ok = false;
      if ("exists" in step.assert) {
        ok = step.assert.exists ? actual !== undefined : actual === undefined;
      } else if ("eq" in step.assert) {
        ok = JSON.stringify(actual) === JSON.stringify(step.assert.eq);
      }

      if (ok && step.expectTier && tier !== step.expectTier) {
        ok = false;
        console.log(`      tier: expected ${step.expectTier}, got ${tier}`);
      }

      const mark = ok ? "✓" : "✗";
      console.log(`  ${mark} step ${i + 1} [${tier}]: ${step.assert.path}`);
      if (!ok) {
        console.log(`      expected: ${JSON.stringify(step.assert)}`);
        console.log(`      actual:   ${JSON.stringify(actual)}`);
      } else {
        passed++;
      }
    }
  } finally {
    setOpenRouterChat(undefined);
    if (prevKey === undefined) delete process.env.VITE_OPENROUTER_API_KEY;
    else process.env.VITE_OPENROUTER_API_KEY = prevKey;
  }

  console.log(`  ${passed}/${seq.steps.length} passed`);
  return passed === seq.steps.length;
}

function checkPlannerContextPack(): boolean {
  console.log("\n▶ planner-context-pack");
  const cases: Array<[string, boolean]> = [];

  const seed = createSeedState();
  const empty = buildPlannerContext(seed, [
    { type: "click", targetId: "dock-notes" },
  ]);
  cases.push(["seed has no focused window", empty.focus.window === undefined]);
  cases.push(["seed has no focused widget", empty.focus.widget === undefined]);
  cases.push(["seed keeps a recent event", empty.recentEvents.length === 1]);
  cases.push([
    "seed recent event target",
    empty.recentEvents[0]?.targetId === "dock-notes",
  ]);

  const openEvent = createSemanticEvent({
    type: "instruction",
    value: "open calendar",
  });
  const plan = planMock(seed, openEvent);
  const response = executePlan(plan, seed);
  const opened = safeApplyPatches(
    createDocument(seed),
    response.statePatch,
    response.uiPatch,
  );
  if (!opened.ok) {
    console.log("  ✗ could not open calendar for context pack");
    return false;
  }

  const overflow: RecentEventSummary[] = [
    { type: "click", targetId: "dock-files" },
    { type: "click", targetId: "dock-notes" },
    { type: "instruction", value: "open calendar" },
    { type: "click", targetId: "dock-settings" },
    { type: "instruction", value: "open notes" },
    { type: "instruction", value: "focus the calendar" },
  ];
  const ctx = buildPlannerContext(opened.doc.state, overflow);
  cases.push(["calendar window id", ctx.focus.window?.id === "win-calendar"]);
  cases.push(["calendar window title", ctx.focus.window?.title === "Calendar"]);
  cases.push(["dock widget type", ctx.focus.widget?.type === "button"]);
  cases.push(["dock widget label", ctx.focus.widget?.label === "📅"]);
  cases.push(["dock widget title", ctx.focus.widget?.title === "Calendar"]);
  cases.push(["recent events capped at 5", ctx.recentEvents.length === 5]);
  cases.push([
    "recent events are the last 5",
    ctx.recentEvents[0]?.targetId === "dock-notes" &&
      ctx.recentEvents[4]?.value === "focus the calendar",
  ]);

  let passed = 0;
  for (const [name, ok] of cases) {
    console.log(`  ${ok ? "✓" : "✗"} ${name}`);
    if (ok) passed++;
  }
  console.log(`  ${passed}/${cases.length} passed`);
  return passed === cases.length;
}

const seqDir = join(__dirname, "sequences");
const sequences = readdirSync(seqDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => join(seqDir, f));

let allOk = checkPlannerContextPack();
for (const file of sequences) {
  const ok = await runSequence(file);
  allOk = allOk && ok;
}

process.exit(allOk ? 0 : 1);
