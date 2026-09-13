import { canRunAgent, estimateTokens } from "../agent/budget";
import { executePlan } from "../agent/executor";
import { planMock } from "../agent/planner";
import { SemanticEvent } from "../protocol/types";
import { tryCompiled } from "./compiled";
import { tryReflex } from "./reflex";
import { createDocument } from "../state/patch";
import { safeApplyPatches } from "../state/safe-patch";
import { createSeedState } from "../state/seed";
import { createSemanticEvent } from "../state/store";
import { FILE_ITEMS } from "../apps/files";
import { SessionHealth } from "./observability";

export const ENDURANCE_P95_MS = 50;

export type EnduranceResult = {
  events: number;
  p50: number;
  p95: number;
  lastMs: number;
  recovered: boolean;
  ok: boolean;
  failures: string[];
};

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx] ?? 0;
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

type DispatchResult = {
  doc: ReturnType<typeof createDocument>;
  failed?: "budget";
};

function dispatch(
  doc: ReturnType<typeof createDocument>,
  event: SemanticEvent,
): DispatchResult {
  const reflex = tryReflex(doc, event);
  if (reflex.handled) {
    const result = safeApplyPatches(doc, reflex.statePatch, reflex.uiPatch);
    if (!result.ok) throw new Error(result.error);
    return { doc: result.doc };
  }

  const compiled = tryCompiled(doc, event);
  if (compiled.handled) {
    const result = safeApplyPatches(doc, compiled.statePatch, compiled.uiPatch);
    if (!result.ok) throw new Error(result.error);
    return { doc: result.doc };
  }

  const plan = planMock(doc.state, event);
  const response = executePlan(plan, doc.state);
  const estimated = Math.max(
    500,
    estimateTokens([...response.statePatch, ...response.uiPatch]),
  );
  if (!canRunAgent(doc.state, estimated)) {
    return { doc, failed: "budget" };
  }
  const result = safeApplyPatches(doc, response.statePatch, response.uiPatch);
  if (!result.ok) throw new Error(result.error);
  return { doc: result.doc };
}

function recoverBudget(doc: ReturnType<typeof createDocument>) {
  const raised = safeApplyPatches(
    doc,
    [{ op: "replace", path: "/meta/budget/tokenLimit", value: 50_000 }],
    [],
  );
  if (!raised.ok) throw new Error(raised.error);
  return raised.doc;
}

function scriptedEvents(): SemanticEvent[] {
  const events: Array<Omit<SemanticEvent, "at">> = [
    { type: "instruction", value: "open the calendar" },
  ];
  for (let i = 0; i < 40; i++) {
    events.push({ type: "click", targetId: i % 2 ? "cal-prev" : "cal-next" });
  }
  events.push({ type: "instruction", value: "open the files app" });
  for (const item of FILE_ITEMS.slice(0, 20)) {
    events.push({ type: "click", targetId: "files-list", value: item.id });
  }
  events.push({ type: "instruction", value: "open the notes app" });
  events.push({
    type: "input",
    targetId: "notes-input",
    value: "endurance note",
  });
  events.push({ type: "instruction", value: "open settings" });
  events.push({ type: "click", targetId: "tab-system" });
  events.push({ type: "click", targetId: "tab-general" });
  events.push({ type: "click", targetId: "theme-win95" });
  events.push({ type: "instruction", value: "open the docs app" });
  events.push({ type: "click", targetId: "tab-widgets" });
  events.push({ type: "click", targetId: "tab-tutorial" });
  events.push({ type: "click", targetId: "tab-architecture" });
  events.push({ type: "instruction", value: "open the terminal" });
  while (events.length < 180) {
    events.push({ type: "click", targetId: "cal-next" });
  }
  return events.map((event) => createSemanticEvent(event));
}

export async function runEnduranceSession(
  targetEvents = 200,
): Promise<EnduranceResult> {
  const health = new SessionHealth();
  const samples: number[] = [];
  const failures: string[] = [];
  let doc = createDocument(createSeedState());
  let recovered = false;

  const planned = scriptedEvents();
  const queue = [...planned];
  while (queue.length < targetEvents) {
    queue.push(createSemanticEvent({ type: "click", targetId: "cal-prev" }));
  }

  for (const event of queue) {
    const start = now();
    const result = dispatch(doc, event);
    const ms = now() - start;
    if (result.failed === "budget") {
      failures.push("unexpected budget before recover probe");
    }
    doc = result.doc;
    samples.push(ms);
    health.record(result.failed ? "agent-big" : "reflex", ms);
  }

  const exhausted = safeApplyPatches(
    doc,
    [{ op: "replace", path: "/meta/budget/tokenLimit", value: 1 }],
    [],
  );
  if (!exhausted.ok) throw new Error(exhausted.error);
  doc = exhausted.doc;

  const recoverEvent = createSemanticEvent({
    type: "instruction",
    value: "open the notes app",
  });
  const blocked = dispatch(doc, recoverEvent);
  if (blocked.failed !== "budget") {
    failures.push("expected budget failure before recover");
  } else {
    doc = recoverBudget(doc);
    const start = now();
    const retried = dispatch(doc, recoverEvent);
    const ms = now() - start;
    samples.push(ms);
    health.record("agent-big", ms);
    if (retried.failed) failures.push("retry after raise still failed");
    else {
      doc = retried.doc;
      recovered = true;
    }
  }

  const snap = health.snapshot();
  const p50 = percentile(samples, 50);
  const p95 = percentile(samples, 95);
  const lastMs = samples[samples.length - 1] ?? 0;
  const events = snap.totalEvents;
  if (events < targetEvents) failures.push(`only ${events} events`);
  if (p95 > ENDURANCE_P95_MS) failures.push(`p95 ${p95.toFixed(1)}ms > ${ENDURANCE_P95_MS}ms`);
  if (!recovered) failures.push("did not recover from budget failure");

  return {
    events,
    p50,
    p95,
    lastMs,
    recovered,
    ok: failures.length === 0,
    failures,
  };
}
