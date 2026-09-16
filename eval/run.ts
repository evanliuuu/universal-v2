import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AgentMode, runAgent } from "../src/agent/loop";
import {
  OpenRouterChatRequest,
  setOpenRouterChat,
} from "../src/agent/openrouter";
import { routeModelTier, executionTierForModel } from "../src/agent/router";
import { tryCompiled } from "../src/runtime/compiled";
import { safeApplyPatches } from "../src/state/safe-patch";
import { createDocument } from "../src/state/patch";
import { createSeedState } from "../src/state/seed";
import { tryReflex } from "../src/runtime/reflex";
import { createSemanticEvent } from "../src/state/store";
import { ExecutionTier, SemanticEvent } from "../src/protocol/types";
import { executePlan } from "../src/agent/executor";
import { executeLive } from "../src/agent/executor-live";
import { planLive } from "../src/agent/planner-live";
import { planMock } from "../src/agent/planner";
import {
  buildPlannerContext,
  PlannerContext,
  RecentEventSummary,
} from "../src/agent/context-pack";
import { decideDelta, decideSnapshot } from "../src/sync/conflict";
import { SessionRoom } from "../src/sync/session-room";
import {
  explainFailure,
  histogram,
  SessionHealth,
} from "../src/runtime/observability";
import { renderTree } from "../src/widgets/registry";
import { NARROW_BREAKPOINT, shouldStackWindows } from "../src/runtime/narrow";
import { VIEWPORT_CSS } from "../src/runtime/renderer";
import { VIEWPORT_PATCH_BUDGET, diffWidgets } from "../src/state/widget-diff";
import {
  VIRTUAL_WINDOW,
  VIRTUALIZE_AFTER,
  shouldVirtualize,
  visibleSlice,
} from "../src/widgets/virtual-list";
import { FILE_ITEMS } from "../src/apps/files";
import { runEnduranceSession } from "../src/runtime/session-endurance";
import { WidgetNode } from "../src/protocol/types";
import { eventKey } from "../src/protocol/messages";
import { encodePrefetchHit, parseAgUiMessage } from "../src/protocol/ag-ui";
import { PrefetchCache } from "../src/agent/prefetch";

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
  const captured: OpenRouterChatRequest[] = [];
  let packedOk = true;

  if (seq.mockResponses) {
    process.env.VITE_OPENROUTER_API_KEY = "eval-mock";
    setOpenRouterChat(async (req) => {
      captured.push(req);
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

    if (seq.mockResponses) {
      const packed = checkCapturedPackedPrompts(captured);
      for (const [name, ok] of packed) {
        console.log(`  ${ok ? "✓" : "✗"} ${name}`);
        if (!ok) packedOk = false;
      }
    }
  } finally {
    setOpenRouterChat(undefined);
    if (prevKey === undefined) delete process.env.VITE_OPENROUTER_API_KEY;
    else process.env.VITE_OPENROUTER_API_KEY = prevKey;
  }

  if (!packedOk) {
    console.log("  packed prompt checks failed");
    return false;
  }
  console.log(`  ${passed}/${seq.steps.length} passed`);
  return passed === seq.steps.length;
}

function parsePackedUser(req: OpenRouterChatRequest): {
  context?: PlannerContext;
  event?: unknown;
} | null {
  try {
    const parsed = JSON.parse(req.user) as {
      context?: PlannerContext;
      event?: unknown;
    };
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function checkCapturedPackedPrompts(
  captured: OpenRouterChatRequest[],
): Array<[string, boolean]> {
  const planner = captured.find((req) => req.title.includes("planner"));
  const executor = captured.find((req) => req.title.includes("executor"));
  const plannerUser = planner ? parsePackedUser(planner) : null;
  const executorUser = executor ? parsePackedUser(executor) : null;

  return [
    ["planner prompt captured", planner !== undefined],
    ["executor prompt captured", executor !== undefined],
    ["planner user includes focus", plannerUser?.context?.focus !== undefined],
    [
      "planner user includes recentEvents",
      Array.isArray(plannerUser?.context?.recentEvents),
    ],
    ["executor user includes focus", executorUser?.context?.focus !== undefined],
    [
      "executor user includes recentEvents",
      Array.isArray(executorUser?.context?.recentEvents),
    ],
  ];
}

function checkAgUiPrefetchHit(): boolean {
  console.log("\n▶ ag-ui-prefetch-hit");
  const cases: Array<[string, boolean]> = [];

  const event = {
    type: "click" as const,
    targetId: "dock-calendar",
    at: "2026-09-15T16:00:00.000Z",
  };
  const cache = new PrefetchCache();
  cache.set(event, {
    statePatch: [],
    uiPatch: [],
    rationale: "open calendar",
  });
  const hit = cache.get(event);
  const key = eventKey(event);
  const encoded = encodePrefetchHit("sess-eval", key, 3.5);
  const parsed = parseAgUiMessage(encoded);

  cases.push(["prefetch cache returns the stored response", hit?.rationale === "open calendar"]);
  cases.push(["prefetch cache records a hit", cache.hits === 1 && cache.misses === 0]);
  cases.push(["wire key matches eventKey", encoded.key === "click:dock-calendar"]);
  cases.push(["encode type is PREFETCH_HIT", encoded.type === "PREFETCH_HIT"]);
  cases.push(["encode keeps session and latency", encoded.sessionId === "sess-eval" && encoded.latencyMs === 3.5]);
  cases.push(["parse accepts a valid hit", parsed?.type === "PREFETCH_HIT"]);
  cases.push([
    "parsed payload matches encode",
    parsed?.type === "PREFETCH_HIT" &&
      parsed.key === encoded.key &&
      parsed.latencyMs === 3.5 &&
      parsed.sessionId === "sess-eval",
  ]);

  const missingKey = parseAgUiMessage({
    type: "PREFETCH_HIT",
    sessionId: "sess-eval",
    latencyMs: 1,
  });
  cases.push(["parse rejects a missing key", missingKey === null]);

  const badLatency = parseAgUiMessage({
    type: "PREFETCH_HIT",
    sessionId: "sess-eval",
    key,
    latencyMs: "fast",
  });
  cases.push(["parse rejects a non-number latency", badLatency === null]);

  const missingLatency = parseAgUiMessage({
    type: "PREFETCH_HIT",
    sessionId: "sess-eval",
    key,
  });
  cases.push(["parse rejects a missing latency", missingLatency === null]);

  const miss = cache.get({
    type: "click",
    targetId: "dock-notes",
    at: event.at,
  });
  cases.push(["prefetch miss stays undefined", miss === undefined && cache.misses === 1]);

  const peerCache = new PrefetchCache();
  const notes = {
    type: "click" as const,
    targetId: "dock-notes",
    at: event.at,
  };
  peerCache.set(notes, {
    statePatch: [],
    uiPatch: [],
    rationale: "open notes",
  });
  cases.push(["drop removes a peer-consumed key", peerCache.drop(eventKey(notes)) === true]);
  cases.push(["dropped key is gone", peerCache.has(notes) === false]);
  cases.push(["drop of unknown key is false", peerCache.drop("click:dock-files") === false]);

  let passed = 0;
  for (const [name, ok] of cases) {
    console.log(`  ${ok ? "✓" : "✗"} ${name}`);
    if (ok) passed++;
  }
  console.log(`  ${passed}/${cases.length} passed`);
  return passed === cases.length;
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

async function checkPackedOpenRouterPrompt(): Promise<boolean> {
  console.log("\n▶ openrouter-packed-prompt");
  const captured: OpenRouterChatRequest[] = [];
  const prevKey = process.env.VITE_OPENROUTER_API_KEY;
  process.env.VITE_OPENROUTER_API_KEY = "eval-mock";
  setOpenRouterChat(async (req) => {
    captured.push(req);
    if (req.title.includes("planner")) {
      return {
        ok: true,
        content: JSON.stringify({
          action: "set_theme",
          theme: "dark",
          rationale: "Switch to dark.",
        }),
      };
    }
    return {
      ok: true,
      content: JSON.stringify({
        statePatch: [{ op: "replace", path: "/meta/theme", value: "dark" }],
        uiPatch: [],
        rationale: "Applying dark theme.",
      }),
    };
  });

  try {
    const seed = createSeedState();
    const openEvent = createSemanticEvent({
      type: "instruction",
      value: "open calendar",
    });
    const openedPlan = executePlan(planMock(seed, openEvent), seed);
    const opened = safeApplyPatches(
      createDocument(seed),
      openedPlan.statePatch,
      openedPlan.uiPatch,
    );
    if (!opened.ok) {
      console.log("  ✗ could not open calendar for packed prompt");
      return false;
    }

    const recentEvents: RecentEventSummary[] = [
      { type: "click", targetId: "dock-files" },
      { type: "click", targetId: "dock-calendar" },
      { type: "instruction", value: "open calendar" },
    ];
    const event = createSemanticEvent({
      type: "instruction",
      value: "switch to dark theme",
    });
    const plan = await planLive(opened.doc.state, event, recentEvents);
    const live = await executeLive(plan, opened.doc.state, event, recentEvents);
    if (!live) {
      console.log("  ✗ live executor did not run");
      return false;
    }

    const planner = captured.find((req) => req.title.includes("planner"));
    const executor = captured.find((req) => req.title.includes("executor"));
    const plannerCtx = planner ? parsePackedUser(planner)?.context : undefined;
    const executorCtx = executor ? parsePackedUser(executor)?.context : undefined;

    const cases: Array<[string, boolean]> = [
      ["planner called", planner !== undefined],
      ["executor called", executor !== undefined],
      ["planner focus window", plannerCtx?.focus.window?.id === "win-calendar"],
      ["planner focus widget", plannerCtx?.focus.widget?.id === "dock-calendar"],
      [
        "planner recent events",
        plannerCtx?.recentEvents.some((e) => e.targetId === "dock-calendar") ===
          true,
      ],
      [
        "executor focus widget",
        executorCtx?.focus.widget?.id === "dock-calendar",
      ],
      [
        "executor recent events",
        executorCtx?.recentEvents.some((e) => e.value === "open calendar") ===
          true,
      ],
      ["live executor applied theme", live.source === "live"],
    ];

    let passed = 0;
    for (const [name, ok] of cases) {
      console.log(`  ${ok ? "✓" : "✗"} ${name}`);
      if (ok) passed++;
    }
    console.log(`  ${passed}/${cases.length} passed`);
    return passed === cases.length;
  } finally {
    setOpenRouterChat(undefined);
    if (prevKey === undefined) delete process.env.VITE_OPENROUTER_API_KEY;
    else process.env.VITE_OPENROUTER_API_KEY = prevKey;
  }
}

function checkSessionConflictPolicy(): boolean {
  console.log("\n▶ session-conflict-policy");
  const cases: Array<[string, boolean]> = [];

  cases.push([
    "delta accepts next seq",
    decideDelta(1, 0).accept === true && decideDelta(1, 0).reason === "next",
  ]);
  cases.push(["delta rejects stale", decideDelta(1, 1).accept === false]);
  cases.push(["delta rejects gap", decideDelta(3, 1).reason === "gap"]);
  cases.push([
    "snapshot catch-up",
    decideSnapshot(5, 2).accept === true,
  ]);
  cases.push(["snapshot stale", decideSnapshot(1, 4).accept === false]);

  const room = new SessionRoom("eval-room", "secret-token", true);
  const snap = room.applySnapshot("secret-token", 0, {
    state: { ok: true },
    ui: { rootId: "x", widgets: {} },
  });
  cases.push(["room accepts initial snapshot", snap.ok === true]);

  const stale = room.applyDelta("secret-token", 0);
  cases.push(["room rejects stale delta", stale.ok === false]);

  const next = room.applyDelta("secret-token", 1);
  cases.push(["room accepts next delta", next.ok === true && room.seq === 1]);

  const gap = room.applyDelta("secret-token", 4);
  cases.push(["room rejects gap delta", gap.ok === false]);

  const unauth = room.applyDelta("wrong", 2);
  cases.push(["room rejects bad token", unauth.ok === false]);

  const newerSnap = room.applySnapshot("secret-token", 2, {
    state: { ok: true, theme: "dark" },
    ui: { rootId: "x", widgets: {} },
  });
  cases.push(["room snapshot catch-up", newerSnap.ok === true && room.seq === 2]);

  let passed = 0;
  for (const [name, ok] of cases) {
    console.log(`  ${ok ? "✓" : "✗"} ${name}`);
    if (ok) passed++;
  }
  console.log(`  ${passed}/${cases.length} passed`);
  return passed === cases.length;
}

function checkObservability(): boolean {
  console.log("\n▶ session-health-observability");
  const cases: Array<[string, boolean]> = [];
  const health = new SessionHealth();
  health.record("reflex", 2);
  health.record("agent-big", 240);
  health.record("compiled", 12);
  const snap = health.snapshot();
  cases.push(["records last sample first", snap.lastMs === 12]);
  cases.push(["tracks three samples", snap.samples.length === 3]);
  cases.push(["counts total events past the sample window", snap.totalEvents === 3]);
  const buckets = histogram(snap.samples);
  cases.push([
    "histogram has a <5ms bucket",
    buckets.some((b) => b.label === "<5ms" && b.count === 1),
  ]);
  cases.push([
    "histogram has a 200ms+ bucket",
    buckets.some((b) => b.label === "200ms+" && b.count === 1),
  ]);
  const budget = explainFailure("budget", "Used 0 of 1 tokens.");
  cases.push(["budget failure is recoverable", budget.recoverable]);
  cases.push([
    "budget recovery label",
    budget.recoveryLabel.includes("Raise"),
  ]);
  const patch = explainFailure("patch", "cannot add /widgets/nope");
  cases.push(["patch failure explains the op", patch.detail.includes("nope")]);

  let passed = 0;
  for (const [name, ok] of cases) {
    console.log(`  ${ok ? "✓" : "✗"} ${name}`);
    if (ok) passed++;
  }
  console.log(`  ${passed}/${cases.length} passed`);
  return passed === cases.length;
}

function checkWidgetA11y(): boolean {
  console.log("\n▶ widget-a11y");
  const cases: Array<[string, boolean]> = [];
  const seed = createSeedState();
  const html = renderTree({
    doc: { ui: { rootId: seed.desktop.rootId, widgets: seed.widgets } },
    windows: seed.windows,
  });
  cases.push(["desktop is an application", html.includes('role="application"')]);
  cases.push(["dock is a toolbar", html.includes('aria-label="Applications"')]);
  cases.push(["calendar dock has accessible name", html.includes('aria-label="Calendar"')]);
  cases.push(["dock icons are buttons", html.includes("dock-calendar") && html.includes("<button")]);

  const plan = planMock(
    seed,
    createSemanticEvent({ type: "instruction", value: "open files" }),
  );
  const response = executePlan(plan, seed);
  const opened = safeApplyPatches(
    createDocument(seed),
    response.statePatch,
    response.uiPatch,
  );
  if (!opened.ok) {
    console.log("  ✗ could not open files for a11y");
    return false;
  }
  const filesHtml = renderTree({
    doc: {
      ui: {
        rootId: opened.doc.ui.rootId,
        widgets: opened.doc.state.widgets,
      },
    },
    windows: opened.doc.state.windows,
  });
  cases.push(["window is a labeled dialog", filesHtml.includes('aria-label="Files"')]);
  cases.push(["close control is a button", filesHtml.includes('aria-label="Close Files"')]);
  cases.push(["file list is a listbox", filesHtml.includes('role="listbox"')]);
  cases.push(["file rows are options", filesHtml.includes('role="option"')]);

  let passed = 0;
  for (const [name, ok] of cases) {
    console.log(`  ${ok ? "✓" : "✗"} ${name}`);
    if (ok) passed++;
  }
  console.log(`  ${passed}/${cases.length} passed`);
  return passed === cases.length;
}

function checkVirtualLists(): boolean {
  console.log("\n▶ virtual-lists");
  const cases: Array<[string, boolean]> = [];
  const long = Array.from({ length: VIRTUALIZE_AFTER + 5 }, (_, i) => ({
    id: `item-${i}`,
    label: `Item ${i}`,
  }));
  cases.push(["short lists stay complete", !shouldVirtualize([{ id: "a", label: "A" }])]);
  cases.push(["long lists virtualize", shouldVirtualize(long)]);
  cases.push(["files list is long enough", FILE_ITEMS.length > VIRTUALIZE_AFTER]);
  const windowed = visibleSlice(long, 0);
  cases.push(["visible window is bounded", windowed.items.length === VIRTUAL_WINDOW]);

  const seed = createSeedState();
  const plan = planMock(
    seed,
    createSemanticEvent({ type: "instruction", value: "open files" }),
  );
  const response = executePlan(plan, seed);
  const opened = safeApplyPatches(
    createDocument(seed),
    response.statePatch,
    response.uiPatch,
  );
  if (!opened.ok) {
    console.log("  ✗ could not open files for virtualization");
    return false;
  }
  const filesHtml = renderTree({
    doc: {
      ui: {
        rootId: opened.doc.ui.rootId,
        widgets: opened.doc.state.widgets,
      },
    },
    windows: opened.doc.state.windows,
  });
  const liCount = filesHtml.match(/class="uw-list-item/g)?.length ?? 0;
  cases.push(["virtual attr is present", filesHtml.includes('data-virtual-list="1"')]);
  cases.push(["DOM rows stay in the window", liCount <= VIRTUAL_WINDOW]);
  cases.push(["DOM rows are fewer than files", liCount < FILE_ITEMS.length]);

  let passed = 0;
  for (const [name, ok] of cases) {
    console.log(`  ${ok ? "✓" : "✗"} ${name}`);
    if (ok) passed++;
  }
  console.log(`  ${passed}/${cases.length} passed`);
  return passed === cases.length;
}

function checkPatchBudget(): boolean {
  console.log("\n▶ viewport-patch-budget");
  const cases: Array<[string, boolean]> = [];
  cases.push(["budget is 8", VIEWPORT_PATCH_BUDGET === 8]);

  const prev: Record<string, WidgetNode> = {};
  const next: Record<string, WidgetNode> = {};
  for (let i = 0; i < VIEWPORT_PATCH_BUDGET + 1; i++) {
    const id = `n${i}`;
    prev[id] = { id, type: "text", props: { text: "a" } };
    next[id] = { id, type: "text", props: { text: "b" } };
  }
  const over = diffWidgets(prev, {
    doc: { ui: { rootId: "n0", widgets: next } },
    windows: {},
  });
  cases.push(["over budget forces a full render", over.fullRender]);

  const smallPrev: Record<string, WidgetNode> = {
    n0: { id: "n0", type: "text", props: { text: "a" } },
  };
  const smallNext: Record<string, WidgetNode> = {
    n0: { id: "n0", type: "text", props: { text: "b" } },
  };
  const under = diffWidgets(smallPrev, {
    doc: { ui: { rootId: "n0", widgets: smallNext } },
    windows: {},
  });
  cases.push(["under budget stays a patch", !under.fullRender && under.patches.length === 1]);

  let passed = 0;
  for (const [name, ok] of cases) {
    console.log(`  ${ok ? "✓" : "✗"} ${name}`);
    if (ok) passed++;
  }
  console.log(`  ${passed}/${cases.length} passed`);
  return passed === cases.length;
}

async function checkEndurance(): Promise<boolean> {
  console.log("\n▶ endurance-200");
  const result = await runEnduranceSession(200);
  const cases: Array<[string, boolean]> = [
    ["ran 200+ events", result.events >= 200],
    ["p95 stays under 50ms", result.p95 <= 50],
    ["recovered from budget miss", result.recovered],
    ["no endurance failures", result.ok],
  ];
  let passed = 0;
  for (const [name, ok] of cases) {
    console.log(`  ${ok ? "✓" : "✗"} ${name}`);
    if (ok) passed++;
  }
  if (!result.ok) {
    for (const failure of result.failures) console.log(`      ${failure}`);
  }
  console.log(
    `  ${passed}/${cases.length} passed (p50 ${result.p50.toFixed(1)}ms, p95 ${result.p95.toFixed(1)}ms, last ${result.lastMs.toFixed(1)}ms)`,
  );
  return passed === cases.length;
}

function checkNarrowLayout(): boolean {
  console.log("\n▶ narrow-layout");
  const cases: Array<[string, boolean]> = [];
  cases.push(["stacks at 390", shouldStackWindows(390)]);
  cases.push(["stacks at breakpoint", shouldStackWindows(NARROW_BREAKPOINT)]);
  cases.push(["does not stack at 800", !shouldStackWindows(800)]);
  cases.push([
    "viewport CSS has narrow media query",
    VIEWPORT_CSS.includes(`@container desktop (max-width: ${NARROW_BREAKPOINT}px)`),
  ]);
  cases.push([
    "narrow CSS stacks windows",
    VIEWPORT_CSS.includes("position: relative !important"),
  ]);
  cases.push(["narrow CSS wraps dock", VIEWPORT_CSS.includes("flex-wrap: wrap")]);

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

let allOk =
  checkAgUiPrefetchHit() &&
  checkPlannerContextPack() &&
  (await checkPackedOpenRouterPrompt()) &&
  checkSessionConflictPolicy() &&
  checkObservability() &&
  checkWidgetA11y() &&
  checkNarrowLayout() &&
  checkVirtualLists() &&
  checkPatchBudget() &&
  (await checkEndurance());
for (const file of sequences) {
  const ok = await runSequence(file);
  allOk = allOk && ok;
}

process.exit(allOk ? 0 : 1);
