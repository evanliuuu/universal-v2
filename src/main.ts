import { createDocument } from "./state/patch";
import { createSeedState } from "./state/seed";
import { RuntimeStore } from "./state/store";
import { UniversalRuntime, tierLabel } from "./runtime/loop";
import { SessionPersistence } from "./persistence/event-log";
import {
  createRemoteSession,
  createWsSync,
} from "./transport/ws-sync";
import {
  buildSessionExport,
  downloadSessionJson,
  parseSessionImport,
} from "./persistence/export";
import { buildShareQuery, parseShareParams } from "./sync/auth";

const eventLogEl = document.getElementById("event-log")!;
const stateViewEl = document.getElementById("state-view")!;
const sessionInfoEl = document.getElementById("session-info")!;
const statsEl = document.getElementById("stats")!;
const serverEl = document.getElementById("server-info")!;
const errorEl = document.getElementById("error-banner")!;
const iframe = document.getElementById("universal-frame") as HTMLIFrameElement;
const agentModeSelect = document.getElementById("agent-mode") as HTMLSelectElement;
const resetBtn = document.getElementById("reset-btn")!;
const clearDbBtn = document.getElementById("clear-db-btn")!;
const replayBtn = document.getElementById("replay-btn")!;
const exportBtn = document.getElementById("export-btn")!;
const shareBtn = document.getElementById("share-btn")!;
const importInput = document.getElementById("import-input") as HTMLInputElement;
const instructBtn = document.getElementById("instruct-btn")!;
const instructInput = document.getElementById("instruct-input") as HTMLInputElement;

function syncApiBase(): string | null {
  const explicit = import.meta.env.VITE_SYNC_API_URL as string | undefined;
  if (explicit) return explicit.replace(/\/$/, "");
  const ws = import.meta.env.VITE_WS_URL as string | undefined;
  if (!ws) return null;
  try {
    const url = new URL(ws, window.location.href);
    url.protocol = url.protocol === "wss:" ? "https:" : "http:";
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function syncStatus(runtime: UniversalRuntime): string {
  if (!runtime.getWsConnected()) return "server: local only (idb)";
  return runtime.getWsEdge()
    ? "server: cloud edge (wss)"
    : "server: connected (ws)";
}

async function boot() {
  const persistence = new SessionPersistence();
  await persistence.init();

  const share = parseShareParams(window.location.search);
  const sessionToken = share.token ?? null;
  const preferredSessionId = share.sessionId;

  const saved = preferredSessionId
    ? null
    : await persistence.loadLatestSession();
  const doc = saved ? saved.document : createDocument(createSeedState());
  const store = new RuntimeStore(doc, preferredSessionId ?? saved?.id);
  if (saved && !preferredSessionId) store.setSeq(saved.seq);
  else {
    await persistence.saveSession({
      id: store.getSessionId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      seq: store.getSeq(),
      document: doc,
    });
  }

  const wsSync = createWsSync();
  if (wsSync) {
    try {
      await wsSync.connect({
        sessionId: store.getSessionId(),
        token: sessionToken ?? undefined,
      });
    } catch {
      // Optional server — IndexedDB remains local source of truth
    }
  }

  const runtime = new UniversalRuntime(store, iframe, persistence, wsSync);
  runtime.setSessionToken(sessionToken);

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
    const drift = runtime.getDriftStats();
    sessionInfoEl.textContent = `session ${store.getSessionId().slice(0, 8)}… · seq ${store.getSeq()}`;
    statsEl.textContent =
      `tokens ${budget.tokensUsed}/${budget.tokenLimit} · prefetch ${pf.hits}/${pf.misses} hits · ${pf.pending} cached · drift recoveries ${drift.events}`;
    serverEl.textContent = syncStatus(runtime);

    const err = runtime.getLastError();
    errorEl.textContent = err ?? "";
    errorEl.hidden = !err;
  }

  runtime.onStatsChange(paint);
  store.subscribe(paint);
  paint();
  runtime.render();

  if (wsSync?.connected && sessionToken) {
    wsSync.pushSnapshot(
      store.getSessionId(),
      store.getSeq(),
      store.getDocument(),
    );
  }

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

  exportBtn.addEventListener("click", () => {
    void (async () => {
      const events = await persistence.getEvents(store.getSessionId());
      const payload = buildSessionExport({
        sessionId: store.getSessionId(),
        seq: store.getSeq(),
        document: store.getDocument(),
        events,
      });
      downloadSessionJson(payload);
    })();
  });

  shareBtn.addEventListener("click", () => {
    void (async () => {
      try {
        let token = runtime.getSessionToken();
        let sessionId = store.getSessionId();
        const base = syncApiBase();
        if (!token) {
          if (!base) {
            errorEl.textContent =
              "Share needs a sync server (set VITE_WS_URL / VITE_SYNC_API_URL)";
            errorEl.hidden = false;
            return;
          }
          const created = await createRemoteSession(base);
          token = created.token;
          sessionId = created.sessionId;
          runtime.setSessionToken(token);
          store.newSession(store.getDocument(), sessionId);
          if (wsSync?.connected) {
            wsSync.join(sessionId, token);
          } else if (wsSync) {
            await wsSync.connect({ sessionId, token });
          }
        }
        const q = buildShareQuery(sessionId, token);
        const url = `${window.location.origin}${window.location.pathname}?${q}`;
        history.replaceState(null, "", `?${q}`);
        wsSync?.pushSnapshot(sessionId, store.getSeq(), store.getDocument());
        await navigator.clipboard.writeText(url);
        serverEl.textContent = `share link copied · ${syncStatus(runtime)}`;
      } catch (error) {
        errorEl.textContent =
          error instanceof Error ? error.message : "Share failed";
        errorEl.hidden = false;
      }
    })();
  });

  importInput.addEventListener("change", () => {
    const file = importInput.files?.[0];
    if (!file) return;
    void (async () => {
      try {
        const data = await parseSessionImport(file);
        store.newSession(data.document, data.sessionId);
        store.setSeq(data.seq);
        for (const record of data.events) {
          store.appendLog({
            seq: record.seq,
            event: record.event,
            tier: record.tier,
            modelTier: record.modelTier,
            prefetchHit: record.prefetchHit,
            patches: record.patches,
            latencyMs: record.latencyMs,
          });
        }
        await persistence.saveSession({
          id: data.sessionId,
          createdAt: data.exportedAt,
          updatedAt: new Date().toISOString(),
          seq: data.seq,
          document: data.document,
        });
        runtime.render();
        paint();
      } catch (error) {
        errorEl.textContent =
          error instanceof Error ? error.message : "Import failed";
        errorEl.hidden = false;
      } finally {
        importInput.value = "";
      }
    })();
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
