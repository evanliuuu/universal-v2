import { createDocument } from "./state/patch";
import { createSeedState } from "./state/seed";
import { RuntimeStore } from "./state/store";
import { UniversalRuntime } from "./runtime/loop";

const eventLogEl = document.getElementById("event-log")!;
const stateViewEl = document.getElementById("state-view")!;
const iframe = document.getElementById("universal-frame") as HTMLIFrameElement;
const agentModeSelect = document.getElementById("agent-mode") as HTMLSelectElement;
const resetBtn = document.getElementById("reset-btn")!;

function boot() {
  const doc = createDocument(createSeedState());
  const store = new RuntimeStore(doc);
  const runtime = new UniversalRuntime(store, iframe);

  function paint() {
    const log = store.getLog();
    eventLogEl.textContent = log
      .map(
        (e) =>
          `#${e.id} [${e.tier}] ${e.event.type}${e.event.targetId ? ` → ${e.event.targetId}` : ""} (${e.latencyMs?.toFixed(0) ?? "?"}ms)\n` +
          e.patches
            .map((p) => `  ${p.target}: ${p.ops.length} ops`)
            .join("\n"),
      )
      .join("\n\n") || "(no events yet)";

    stateViewEl.textContent = JSON.stringify(store.getState(), null, 2);
  }

  store.subscribe(paint);
  paint();
  runtime.render();

  agentModeSelect.addEventListener("change", () => {
    runtime.setAgentMode(agentModeSelect.value as "mock" | "openrouter");
  });

  resetBtn.addEventListener("click", () => {
    runtime.reset(createDocument(createSeedState()));
  });

  return runtime;
}

boot();
