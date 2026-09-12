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
const errorCard = document.getElementById("error-card")!;
const errorTitleEl = document.getElementById("error-title")!;
const errorEl = document.getElementById("error-banner")!;
const retryBtn = document.getElementById("retry-btn") as HTMLButtonElement;
const tokenBarFill = document.getElementById("token-bar-fill")!;
const tokenBarLabel = document.getElementById("token-bar-label")!;
const latencySummaryEl = document.getElementById("latency-summary")!;
const latencyHistEl = document.getElementById("latency-hist")!;
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
  // Only attach to a Durable Object when we have a share token — otherwise the
  // first write hits a locked room and surfaces a false unauthorized error.
  if (wsSync && sessionToken && preferredSessionId) {
    try {
      await wsSync.connect({
        sessionId: preferredSessionId,
        token: sessionToken,
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
    const usedPct = Math.min(
      100,
      Math.round((budget.tokensUsed / Math.max(budget.tokenLimit, 1)) * 100),
    );
    tokenBarFill.style.width = `${usedPct}%`;
    tokenBarFill.className =
      usedPct >= 90 ? "bar-fill hot" : usedPct >= 70 ? "bar-fill warn" : "bar-fill";
    tokenBarLabel.textContent = `${budget.tokensUsed}/${budget.tokenLimit}`;

    const health = runtime.getHealth();
    const last =
      health.lastMs != null
        ? `last ${health.lastMs.toFixed(0)}ms [${health.lastTier}]`
        : "no timings yet";
    latencySummaryEl.textContent = last;
    const maxBucket = Math.max(1, ...health.buckets.map((b) => b.count));
    latencyHistEl.innerHTML = health.buckets
      .map((bucket) => {
        const h = Math.max(4, Math.round((bucket.count / maxBucket) * 40));
        return `<div class="latency-col" title="${bucket.label}: ${bucket.count}"><div class="latency-bar" style="height:${h}px"></div><span>${bucket.label}</span></div>`;
      })
      .join("");

    statsEl.textContent =
      `prefetch ${pf.hits}/${pf.misses} hits · ${pf.pending} cached · drift recoveries ${drift.events}`;
    serverEl.textContent = syncStatus(runtime);

    const failure = runtime.getLastFailure();
    if (failure) {
      errorTitleEl.textContent = failure.message;
      errorEl.textContent = failure.detail;
      retryBtn.hidden = !failure.recoverable;
      retryBtn.textContent = failure.recoveryLabel;
      errorCard.hidden = false;
    } else {
      errorCard.hidden = true;
      retryBtn.hidden = true;
    }
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
            errorTitleEl.textContent = "Share failed";
            errorEl.textContent =
              "Share needs a sync server (set VITE_WS_URL / VITE_SYNC_API_URL)";
            retryBtn.hidden = true;
            errorCard.hidden = false;
            return;
          }
          const created = await createRemoteSession(base);
          token = created.token;
          sessionId = created.sessionId;
          runtime.setSessionToken(token);
          store.newSession(store.getDocument(), sessionId);
        }
        if (wsSync) {
          // Session DO is keyed by sessionId — must open a fresh socket.
          await wsSync.reconnect({ sessionId, token });
        }
        const q = buildShareQuery(sessionId, token);
        const url = `${window.location.origin}${window.location.pathname}?${q}`;
        history.replaceState(null, "", `?${q}`);
        wsSync?.pushSnapshot(sessionId, store.getSeq(), store.getDocument());
        errorCard.hidden = true;
        errorEl.textContent = "";
        try {
          await navigator.clipboard.writeText(url);
          serverEl.textContent = `share link copied · ${syncStatus(runtime)}`;
        } catch {
          serverEl.textContent = `share ready · ${syncStatus(runtime)} · ${url}`;
        }
        paint();
      } catch (error) {
        errorTitleEl.textContent = "Share failed";
        errorEl.textContent =
          error instanceof Error ? error.message : "Share failed";
        retryBtn.hidden = true;
        errorCard.hidden = false;
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
        errorTitleEl.textContent = "Import failed";
        errorEl.textContent =
          error instanceof Error ? error.message : "Import failed";
        retryBtn.hidden = true;
        errorCard.hidden = false;
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

  retryBtn.addEventListener("click", () => {
    void runtime.recover().then(() => paint());
  });

  return runtime;
}

void boot();
