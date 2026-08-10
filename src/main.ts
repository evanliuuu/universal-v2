import { createDocument } from "./state/patch";
import { createSeedState } from "./state/seed";
import { RuntimeStore } from "./state/store";
import { UniversalRuntime, tierLabel } from "./runtime/loop";
import { SessionPersistence } from "./persistence/event-log";

const eventLogEl = document.getElementById("event-log")!;
const stateViewEl = document.getElementById("state-view")!;
const sessionInfoEl = document.getElementById("session-info")!;
const statsEl = document.getElementById("stats")!;
const errorEl = document.getElementById("error-banner")!;
const iframe = document.getElementById("universal-frame") as HTMLIFrameElement;
const agentModeSelect = document.getElementById("agent-mode") as HTMLSelectElement;
const resetBtn = document.getElementById("reset-btn")!;
const clearDbBtn = document.getElementById("clear-db-btn")!;
const replayBtn = document.getElementById("replay-btn")!;
const instructBtn = document.getElementById("instruct-btn")!;
const instructInput = document.getElementById("instruct-input") as HTMLInputElement;

async function boot() {
  const persistence = new SessionPersistence();
  await persistence.init();

  const saved = await persistence.loadLatestSession();
  const doc = saved
    ? saved.document
    : createDocument(createSeedState());
  const store = new RuntimeStore(doc, saved?.id);
  if (saved) store.setSeq(saved.seq);
  else {
    await persistence.saveSession({
      id: store.getSessionId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      seq: 0,
      document: doc,
    });
  }

  const runtime = new UniversalRuntime(store, iframe, persistence);

  function paint() {
    const log = store.getLog();
    eventLogEl.textContent =
      log
        .map(
          (e) =>
            `#${e.id} seq=${e.seq} [${tierLabel(e.tier, e.prefetchHit)}] ${e.event.type}${e.event.targetId ? ` → ${e.event.targetId}` : ""} (${e.latencyMs?.toFixed(0) ?? "?"}ms)`,
        )
        .join("\n") || "(no events yet)";

    stateViewEl.textContent = JSON.stringify(store.getState(), null, 2);

    const pf = runtime.getPrefetchStats();
    const budget = runtime.getBudgetStats();
    sessionInfoEl.textContent = `session ${store.getSessionId().slice(0, 8)}… · seq ${store.getSeq()}`;
    statsEl.textContent =
      `tokens ${budget.tokensUsed}/${budget.tokenLimit} · prefetch ${pf.hits}/${pf.misses} hits · ${pf.pending} cached`;

    const err = runtime.getLastError();
    errorEl.textContent = err ?? "";
    errorEl.hidden = !err;
  }

  runtime.onStatsChange(paint);
  store.subscribe(paint);
  paint();

  agentModeSelect.addEventListener("change", () => {
    runtime.setAgentMode(agentModeSelect.value as "mock" | "openrouter");
  });

  resetBtn.addEventListener("click", () => {
    void runtime.reset(createDocument(createSeedState()));
  });

  clearDbBtn.addEventListener("click", () => {
    void runtime.reset(createDocument(createSeedState()));
  });

  replayBtn.addEventListener("click", () => {
    void runtime.replay((step) => {
      eventLogEl.textContent = `Replaying… seq ${step.seq} [${step.tier}] ${step.event.type}`;
    }).then(() => paint());
  });

  instructBtn.addEventListener("click", () => {
    const value = instructInput.value.trim();
    if (!value) return;
    void runtime.dispatch({
      type: "instruction",
      value,
      at: new Date().toISOString(),
    });
    instructInput.value = "";
  });

  instructInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") instructBtn.click();
  });

  return runtime;
}

void boot();
