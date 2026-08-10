import {
  AgentResponse,
  AppliedPatch,
  ExecutionTier,
  SemanticEvent,
} from "../protocol/types";
import { eventKey } from "../protocol/messages";
import {
  applyStatePatch,
  applyUiPatch,
  cloneDocument,
  UniversalDocument,
} from "../state/patch";
import {
  KEYFRAME_EVERY_N_EVENTS,
  SessionPersistence,
} from "../persistence/event-log";
import { runAgent, prefetchAgent, AgentMode } from "../agent/loop";
import { executionTierForModel, routeModelTier } from "../agent/router";
import { likelyPrefetchEvents, PrefetchCache } from "../agent/prefetch";
import { RuntimeStore, createSemanticEvent, tierLabel } from "../state/store";
import { tryReflex } from "./reflex";
import { tryCompiled } from "./compiled";
import { mountViewport } from "./renderer";

export type { AgentMode };

export class UniversalRuntime {
  private store: RuntimeStore;
  private iframe: HTMLIFrameElement;
  private persistence: SessionPersistence;
  private prefetch = new PrefetchCache();
  private agentMode: AgentMode = "mock";
  private busy = false;
  private onStats?: () => void;

  constructor(
    store: RuntimeStore,
    iframe: HTMLIFrameElement,
    persistence: SessionPersistence,
  ) {
    this.store = store;
    this.iframe = iframe;
    this.persistence = persistence;
    window.addEventListener("message", (e) => this.onViewportMessage(e));
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

  async reset(doc: UniversalDocument) {
    this.store.newSession(doc);
    this.prefetch.clear();
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

  private onViewportMessage(event: MessageEvent) {
    const data = event.data;
    if (!data || data.source !== "universal-viewport") return;

    if (data.type === "close_window") {
      void this.dispatch(
        createSemanticEvent({
          type: "close_window",
          value: data.windowId,
        }),
      );
      return;
    }

    if (data.type === "click") {
      void this.dispatch(
        createSemanticEvent({
          type: "click",
          targetId: data.targetId,
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
    const start = performance.now();
    const doc = this.store.getDocument();
    const patches: AppliedPatch[] = [];
    const seq = this.store.nextSeq();

    try {
      const reflex = tryReflex(doc, event);
      if (reflex.handled) {
        await this.applyPatches(doc, reflex.statePatch, reflex.uiPatch, patches);
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
        await this.applyPatches(
          doc,
          compiled.statePatch,
          compiled.uiPatch,
          patches,
        );
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
        await this.applyAgentResponse(doc, prefetched, patches);
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

      const modelTier = routeModelTier(event, doc.state);
      const response = await runAgent({
        mode: this.agentMode,
        modelTier,
        state: doc.state,
        event,
      });

      await this.applyAgentResponse(doc, response, patches);
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
    _doc: UniversalDocument,
    statePatch: AgentResponse["statePatch"],
    uiPatch: AgentResponse["uiPatch"],
    patches: AppliedPatch[],
  ) {
    let next = cloneDocument(this.store.getDocument());
    if (statePatch.length) {
      next = applyStatePatch(next, statePatch);
      patches.push({ target: "state", ops: statePatch });
    }
    if (uiPatch.length) {
      next = applyUiPatch(next, uiPatch);
      patches.push({ target: "ui", ops: uiPatch });
    }
    this.store.setDocument(next);
    this.render();
  }

  private async applyAgentResponse(
    doc: UniversalDocument,
    response: AgentResponse,
    patches: AppliedPatch[],
  ) {
    await this.applyPatches(doc, response.statePatch, response.uiPatch, patches);
    if (
      !response.uiPatch.length &&
      response.statePatch.some((op) => op.path.startsWith("/widgets"))
    ) {
      patches.push({
        target: "ui",
        ops: response.statePatch.filter((op) => op.path.startsWith("/widgets")),
      });
    }
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
  }

  private async schedulePrefetch() {
    const state = this.store.getState();
    const events = likelyPrefetchEvents(state);

    for (const event of events) {
      const key = eventKey(event);
      if (this.prefetch.has(event) || this.prefetch.isInFlight(key)) continue;

      this.prefetch.markInFlight(key);
      try {
        const response = await prefetchAgent(
          this.agentMode,
          state,
          event,
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
