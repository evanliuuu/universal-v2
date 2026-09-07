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
      );
      doc = next;

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

const seqDir = join(__dirname, "sequences");
const sequences = readdirSync(seqDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => join(seqDir, f));

let allOk = true;
for (const file of sequences) {
  const ok = await runSequence(file);
  allOk = allOk && ok;
}

process.exit(allOk ? 0 : 1);
