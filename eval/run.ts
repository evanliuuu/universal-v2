import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runAgent } from "../src/agent/loop";
import { routeModelTier, executionTierForModel } from "../src/agent/router";
import { createDocument, applyStatePatch, applyUiPatch } from "../src/state/patch";
import { createSeedState } from "../src/state/seed";
import { tryReflex } from "../src/runtime/reflex";
import { tryCompiled } from "../src/runtime/compiled";
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
};

type EvalSequence = {
  name: string;
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
): Promise<{ doc: typeof doc; tier: ExecutionTier }> {
  const reflex = tryReflex(doc, event);
  if (reflex.handled) {
    let next = applyStatePatch(doc, reflex.statePatch);
    if (reflex.uiPatch.length) next = applyUiPatch(next, reflex.uiPatch);
    return { doc: next, tier: "reflex" };
  }

  const compiled = tryCompiled(doc, event);
  if (compiled.handled) {
    let next = applyStatePatch(doc, compiled.statePatch);
    if (compiled.uiPatch.length) next = applyUiPatch(next, compiled.uiPatch);
    return { doc: next, tier: "compiled" };
  }

  const modelTier = routeModelTier(event, doc.state);
  const response = await runAgent({
    mode: "mock",
    modelTier,
    state: doc.state,
    event,
  });
  let next = applyStatePatch(doc, response.statePatch);
  if (response.uiPatch.length) next = applyUiPatch(next, response.uiPatch);
  return { doc: next, tier: executionTierForModel(modelTier) };
}

async function runSequence(file: string): Promise<boolean> {
  const seq: EvalSequence = JSON.parse(readFileSync(file, "utf-8"));
  let doc = createDocument(createSeedState());
  let passed = 0;

  console.log(`\n▶ ${seq.name}`);

  for (const [i, step] of seq.steps.entries()) {
    const event = createSemanticEvent(step.event);
    const { doc: next, tier } = await dispatchStep(doc, event);
    doc = next;

    const actual = getAtPath(doc.state, step.assert.path);
    let ok = false;
    if (step.assert.exists) ok = actual !== undefined;
    else if ("eq" in step.assert) {
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
