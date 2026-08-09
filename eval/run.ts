import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runAgent } from "../src/agent/loop";
import { createDocument, applyStatePatch } from "../src/state/patch";
import { createSeedState } from "../src/state/seed";
import { tryReflex } from "../src/runtime/reflex";
import { createSemanticEvent } from "../src/state/store";
import { SemanticEvent } from "../src/protocol/types";

const __dirname = dirname(fileURLToPath(import.meta.url));

type AssertStep = {
  path: string;
  exists?: boolean;
  eq?: unknown;
};

type EvalStep = {
  event: Omit<SemanticEvent, "at">;
  assert: AssertStep;
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

async function runSequence(file: string): Promise<boolean> {
  const seq: EvalSequence = JSON.parse(readFileSync(file, "utf-8"));
  let doc = createDocument(createSeedState());
  let passed = 0;

  console.log(`\n▶ ${seq.name}`);

  for (const [i, step] of seq.steps.entries()) {
    const event = createSemanticEvent(step.event);
    const reflex = tryReflex(doc, event);
    if (reflex.handled) {
      doc = applyStatePatch(doc, reflex.statePatch);
    } else {
      const response = await runAgent({ mode: "mock", state: doc.state, event });
      doc = applyStatePatch(doc, response.statePatch);
    }

    const actual = getAtPath(doc.state, step.assert.path);
    let ok = false;
    if (step.assert.exists) ok = actual !== undefined;
    else if ("eq" in step.assert) ok = JSON.stringify(actual) === JSON.stringify(step.assert.eq);

    const mark = ok ? "✓" : "✗";
    console.log(`  ${mark} step ${i + 1}: ${step.assert.path}`);
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

const sequences = [join(__dirname, "sequences", "open-calendar.json")];
let allOk = true;
for (const file of sequences) {
  const ok = await runSequence(file);
  allOk = allOk && ok;
}

process.exit(allOk ? 0 : 1);
