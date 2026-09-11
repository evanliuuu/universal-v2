import {
  AgentResponse,
  AppliedPatch,
  ExecutionTier,
  JsonPatchOp,
  SemanticEvent,
} from "../protocol/types";
import { eventKey } from "../protocol/messages";
import {
  applyStatePatch,
  applyUiPatch,
  cloneDocument,
  UniversalDocument,
} from "../state/patch";
import { safeApplyPatches } from "../state/safe-patch";
import {
  KEYFRAME_EVERY_N_EVENTS,
  SessionPersistence,
} from "../persistence/event-log";
import { runAgent, prefetchAgent, AgentMode } from "../agent/loop";
import { recentEventsFromLog } from "../agent/context-pack";
import { executionTierForModel, routeModelTier } from "../agent/router";
import {
  canPrefetch,
  canRunAgent,
  chargeTokensPatch,
  estimateTokens,
  getBudget,
} from "../agent/budget";
import { likelyPrefetchEvents, PrefetchCache } from "../agent/prefetch";
import { RuntimeStore, createSemanticEvent, tierLabel } from "../state/store";
import { tryReflex } from "./reflex";
import { tryCompiled } from "./compiled";
import { mountViewport } from "./renderer";
import { viewportBridge } from "./viewport-bridge";
import { replaySession, ReplayStep } from "./replay";
import { decideRemoteApply } from "../sync/conflict";
import { SyncInboundMessage, WsSync } from "../transport/ws-sync";

export type { AgentMode };

export class UniversalRuntime {
  private store: RuntimeStore;
  private iframe: HTMLIFrameElement;
  private persistence: SessionPersistence;
  private prefetch = new PrefetchCache();
  private agentMode: AgentMode = "mock";
  private busy = false;
  private lastError: string | null = null;
  private onStats?: () => void;
  private wsSync: WsSync | null;
  private applyingRemote = false;
  private sessionToken: string | null = null;

  constructor(
    store: RuntimeStore,
    iframe: HTMLIFrameElement,
    persistence: SessionPersistence,
    wsSync: WsSync | null = null,
  ) {
    this.store = store;
    this.iframe = iframe;
    this.persistence = persistence;
    this.wsSync = wsSync;
    this.wsSync?.setHandler((msg) => {
      void this.onSyncMessage(msg);
    });
    window.addEventListener("message", (e) => this.onViewportMessage(e));
  }

  setSessionToken(token: string | null) {
    this.sessionToken = token;
  }

  getSessionToken() {
    return this.sessionToken;
  }

  /** Apply authoritative remote state without echoing back to the server. */
  async applyRemoteSnapshot(seq: number, document: UniversalDocument) {
    const decision = decideRemoteApply(seq, this.store.getSeq(), "snapshot");
    if (!decision.accept) return false;
    this.applyingRemote = true;
    try {
      this.store.setDocument(document);
      this.store.setSeq(seq);
      await this.persistence.saveSession({
        id: this.store.getSessionId(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        seq,
        document: cloneDocument(document),
      });
      this.render();
      this.onStats?.();
      return true;
    } finally {
      this.applyingRemote = false;
    }
  }

  async applyRemoteDelta(
    seq: number,
    statePatch: JsonPatchOp[],
    uiPatch: JsonPatchOp[],
  ) {
    const decision = decideRemoteApply(seq, this.store.getSeq(), "delta");
    if (!decision.accept) return false;
    this.applyingRemote = true;
    try {
      const result = safeApplyPatches(
        this.store.getDocument(),
        statePatch,
        uiPatch,
      );
      if (!result.ok) {
        this.lastError = result.error;
        return false;
      }
      this.store.setDocument(result.doc);
      this.store.setSeq(seq);
      this.render();
      this.onStats?.();
      return true;
    } finally {
      this.applyingRemote = false;
    }
  }

  private async onSyncMessage(msg: SyncInboundMessage) {
    if (msg.type === "REJECTED") {
      this.lastError = `sync rejected: ${msg.reason ?? "unknown"} (server seq ${msg.serverSeq ?? "?"})`;
      if (msg.snapshot?.state && msg.snapshot?.ui) {
        await this.applyRemoteSnapshot(msg.serverSeq ?? 0, {
          state: msg.snapshot.state as UniversalDocument["state"],
          ui: msg.snapshot.ui as UniversalDocument["ui"],
        });
      }
      this.onStats?.();
      return;
    }

    if (msg.type === "JOIN_OK" && msg.snapshot?.state && msg.snapshot?.ui) {
      await this.applyRemoteSnapshot(msg.serverSeq ?? 0, {
        state: msg.snapshot.state as UniversalDocument["state"],
        ui: msg.snapshot.ui as UniversalDocument["ui"],
      });
      return;
    }

    if (
      msg.type === "STATE_SNAPSHOT" &&
      msg.state &&
      msg.ui &&
      typeof msg.seq === "number"
    ) {
      await this.applyRemoteSnapshot(msg.seq, {
        state: msg.state as UniversalDocument["state"],
        ui: msg.ui as UniversalDocument["ui"],
      });
      return;
    }

    if (
      (msg.type === "STATE_DELTA" || msg.type === "UI_DELTA") &&
      typeof msg.seq === "number" &&
      Array.isArray(msg.patch)
    ) {
      const statePatch = msg.type === "STATE_DELTA" ? msg.patch : [];
      const uiPatch = msg.type === "UI_DELTA" ? msg.patch : [];
      await this.applyRemoteDelta(msg.seq, statePatch, uiPatch);
    }
  }

  onStatsChange(fn: () => void) {
    this.onStats = fn;
  }

  setAgentMode(mode: AgentMode) {
    this.agentMode = mode;
    this.prefetch.clear();
  }

  getPrefetchStats() {
    return this.prefetch.stats();
  }

  getDriftStats() {
    return viewportBridge.getDriftStats();
  }

  getBudgetStats() {
    return getBudget(this.store.getState());
  }

  getLastError() {
    return this.lastError;
  }

  getWsConnected() {
    return this.wsSync?.connected ?? false;
  }

  getWsEdge() {
    return this.wsSync?.edge ?? false;
  }

  async reset(doc: UniversalDocument) {
    this.store.newSession(doc);
    this.prefetch.clear();
    this.lastError = null;
    viewportBridge.reset();
    await this.persistence.clearAll();
    await this.persistSnapshot();
    this.render();
    this.onStats?.();
  }

  getStore() {
    return this.store;
  }

  render() {
    mountViewport(this.iframe, this.store.getDocument());
  }

  async replay(onStep?: (step: ReplayStep) => void) {
    const doc = await replaySession(
      this.persistence,
      this.store.getSessionId(),
      onStep,
    );
    this.store.setDocument(doc);
    this.render();
    this.onStats?.();
  }

  private onViewportMessage(event: MessageEvent) {
    const data = event.data;
    if (!data || data.source !== "universal-viewport") return;

    if (data.type === "ready") {
      viewportBridge.markReady();
      this.render();
      return;
    }

    if (data.type === "close_window") {
      void this.dispatch(
        createSemanticEvent({
          type: "close_window",
          value: data.windowId,
        }),
      );
      return;
    }

    if (data.type === "resize_window") {
      void this.dispatch(
        createSemanticEvent({
          type: "resize_window",
          value: {
            windowId: data.windowId,
            width: data.width,
            height: data.height,
          },
        }),
      );
      return;
    }

    if (data.type === "click") {
      void this.dispatch(
        createSemanticEvent({
          type: "click",
          targetId: data.targetId,
          value: data.value,
        }),
      );
      return;
    }

    if (data.type === "input") {
      void this.dispatch(
        createSemanticEvent({
          type: "input",
          targetId: data.targetId,
          value: data.value,
        }),
      );
    }
  }

  async dispatch(event: SemanticEvent): Promise<void> {
    if (this.busy && event.type !== "instruction") return;
    this.busy = true;
    this.lastError = null;
    const start = performance.now();
    const doc = this.store.getDocument();
    const patches: AppliedPatch[] = [];
    const seq = this.store.nextSeq();

    try {
      const reflex = tryReflex(doc, event);
      if (reflex.handled) {
        const ok = await this.applyPatches(
          reflex.statePatch,
          reflex.uiPatch,
          patches,
        );
        if (!ok) return;
        await this.finishDispatch({
          event,
          seq,
          tier: "reflex",
          patches,
          latencyMs: performance.now() - start,
        });
        return;
      }

      const compiled = tryCompiled(doc, event);
      if (compiled.handled) {
        const ok = await this.applyPatches(
          compiled.statePatch,
          compiled.uiPatch,
          patches,
        );
        if (!ok) return;
        await this.finishDispatch({
          event,
          seq,
          tier: "compiled",
          patches,
          latencyMs: performance.now() - start,
        });
        return;
      }

      const prefetched = this.prefetch.get(event);
      if (prefetched) {
        const ok = await this.applyAgentResponse(prefetched, patches);
        if (!ok) return;
        await this.finishDispatch({
          event,
          seq,
          tier: "prefetch",
          patches,
          latencyMs: performance.now() - start,
          prefetchHit: true,
        });
        return;
      }

      if (!canRunAgent(doc.state)) {
        this.lastError = "Token budget exhausted for this session.";
        this.onStats?.();
        return;
      }

      const modelTier = routeModelTier(event, doc.state);
      const response = await runAgent({
        mode: this.agentMode,
        modelTier,
        state: doc.state,
        event,
        recentEvents: recentEventsFromLog(this.store.getLog()),
      });

      const tokenOps = [
        chargeTokensPatch(
          doc.state,
          estimateTokens([...response.statePatch, ...response.uiPatch]),
        ),
      ];
      response.statePatch = [...response.statePatch, ...tokenOps];

      const ok = await this.applyAgentResponse(response, patches);
      if (!ok) return;

      await this.finishDispatch({
        event,
        seq,
        tier: executionTierForModel(modelTier),
        modelTier,
        patches,
        latencyMs: performance.now() - start,
      });

      void this.schedulePrefetch();
    } finally {
      this.busy = false;
    }
  }

  private async applyPatches(
    statePatch: AgentResponse["statePatch"],
    uiPatch: AgentResponse["uiPatch"],
    patches: AppliedPatch[],
  ): Promise<boolean> {
    const result = safeApplyPatches(
      this.store.getDocument(),
      statePatch,
      uiPatch,
    );
    if (!result.ok) {
      this.lastError = `Patch rejected: ${result.error}`;
      this.onStats?.();
      return false;
    }

    if (statePatch.length) patches.push({ target: "state", ops: statePatch });
    if (uiPatch.length) patches.push({ target: "ui", ops: uiPatch });

    this.store.setDocument(result.doc);
    this.render();
    return true;
  }

  private async applyAgentResponse(
    response: AgentResponse,
    patches: AppliedPatch[],
  ): Promise<boolean> {
    const ok = await this.applyPatches(
      response.statePatch,
      response.uiPatch,
      patches,
    );
    if (
      ok &&
      !response.uiPatch.length &&
      response.statePatch.some((op) => op.path.startsWith("/widgets"))
    ) {
      patches.push({
        target: "ui",
        ops: response.statePatch.filter((op) => op.path.startsWith("/widgets")),
      });
    }
    return ok;
  }

  private async finishDispatch(opts: {
    event: SemanticEvent;
    seq: number;
    tier: ExecutionTier;
    modelTier?: "fast" | "big";
    prefetchHit?: boolean;
    patches: AppliedPatch[];
    latencyMs: number;
  }) {
    this.store.appendLog({
      seq: opts.seq,
      event: opts.event,
      tier: opts.tier,
      modelTier: opts.modelTier,
      prefetchHit: opts.prefetchHit,
      patches: opts.patches,
      latencyMs: opts.latencyMs,
    });

    await this.persistence.appendEvent({
      sessionId: this.store.getSessionId(),
      seq: opts.seq,
      event: opts.event,
      tier: opts.tier,
      modelTier: opts.modelTier,
      prefetchHit: opts.prefetchHit,
      patches: opts.patches,
      latencyMs: opts.latencyMs,
      at: new Date().toISOString(),
    });

    this.wsSync?.pushEvent(this.store.getSessionId(), {
      sessionId: this.store.getSessionId(),
      seq: opts.seq,
      event: opts.event,
      tier: opts.tier,
      modelTier: opts.modelTier,
      prefetchHit: opts.prefetchHit,
      patches: opts.patches,
      latencyMs: opts.latencyMs,
      at: new Date().toISOString(),
    });

    if (!this.applyingRemote) {
      const sessionId = this.store.getSessionId();
      for (const patch of opts.patches) {
        if (patch.target === "state") {
          this.wsSync?.pushStateDelta(sessionId, opts.seq, patch.ops);
        } else if (patch.target === "ui") {
          this.wsSync?.pushUiDelta(sessionId, opts.seq, patch.ops);
        }
      }
      if (opts.prefetchHit) {
        this.wsSync?.pushPrefetchHit(
          sessionId,
          eventKey(opts.event),
          opts.latencyMs,
        );
      }
      this.wsSync?.pushRunFinished(
        sessionId,
        opts.seq,
        opts.tier,
        opts.latencyMs,
      );
    }

    if (opts.seq % KEYFRAME_EVERY_N_EVENTS === 0) {
      await this.persistSnapshot();
    }

    this.onStats?.();
  }

  private async persistSnapshot() {
    const now = new Date().toISOString();
    await this.persistence.saveSession({
      id: this.store.getSessionId(),
      createdAt: now,
      updatedAt: now,
      seq: this.store.getSeq(),
      document: cloneDocument(this.store.getDocument()),
    });
    if (!this.applyingRemote) {
      this.wsSync?.pushSnapshot(
        this.store.getSessionId(),
        this.store.getSeq(),
        cloneDocument(this.store.getDocument()),
      );
    }
  }

  private async schedulePrefetch() {
    const state = this.store.getState();
    const stats = this.prefetch.stats();
    if (!canPrefetch(state, stats.pending)) return;

    const events = likelyPrefetchEvents(state);

    for (const event of events) {
      if (!canPrefetch(this.store.getState(), this.prefetch.stats().pending)) {
        break;
      }

      const key = eventKey(event);
      if (this.prefetch.has(event) || this.prefetch.isInFlight(key)) continue;

      this.prefetch.markInFlight(key);
      try {
        const response = await prefetchAgent(
          this.agentMode,
          state,
          event,
          recentEventsFromLog(this.store.getLog()),
        );
        this.prefetch.set(event, response);
      } catch {
        // Prefetch is best-effort
      } finally {
        this.prefetch.clearInFlight(key);
      }
    }
    this.onStats?.();
  }
}

export { tierLabel };
