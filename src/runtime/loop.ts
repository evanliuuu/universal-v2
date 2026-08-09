import {
  AgentResponse,
  AppliedPatch,
  SemanticEvent,
} from "../protocol/types";
import {
  applyStatePatch,
  applyUiPatch,
  cloneDocument,
  UniversalDocument,
} from "../state/patch";
import { RuntimeStore, createSemanticEvent } from "../state/store";
import { tryReflex } from "./reflex";
import { runAgent } from "../agent/loop";
import { mountViewport } from "./renderer";

export type AgentMode = "mock" | "openrouter";

export class UniversalRuntime {
  private store: RuntimeStore;
  private iframe: HTMLIFrameElement;
  private agentMode: AgentMode = "mock";
  private busy = false;

  constructor(store: RuntimeStore, iframe: HTMLIFrameElement) {
    this.store = store;
    this.iframe = iframe;
    window.addEventListener("message", (e) => this.onViewportMessage(e));
  }

  setAgentMode(mode: AgentMode) {
    this.agentMode = mode;
  }

  reset(doc: UniversalDocument) {
    this.store.setDocument(doc);
    this.render();
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

    try {
      const reflex = tryReflex(doc, event);
      if (reflex.handled) {
        let next = cloneDocument(doc);
        if (reflex.statePatch.length) {
          next = applyStatePatch(next, reflex.statePatch);
          patches.push({ target: "state", ops: reflex.statePatch });
        }
        if (reflex.uiPatch.length) {
          next = applyUiPatch(next, reflex.uiPatch);
          patches.push({ target: "ui", ops: reflex.uiPatch });
        }
        this.store.setDocument(next);
        this.render();
        this.store.appendLog({
          event,
          tier: "reflex",
          patches,
          latencyMs: performance.now() - start,
        });
        return;
      }

      const response: AgentResponse = await runAgent({
        mode: this.agentMode,
        state: doc.state,
        event,
      });

      let next = cloneDocument(doc);
      if (response.statePatch.length) {
        next = applyStatePatch(next, response.statePatch);
        patches.push({ target: "state", ops: response.statePatch });
      }
      if (response.uiPatch.length) {
        next = applyUiPatch(next, response.uiPatch);
        patches.push({ target: "ui", ops: response.uiPatch });
      } else if (response.statePatch.some((op) => op.path.startsWith("/widgets"))) {
        patches.push({ target: "ui", ops: response.statePatch.filter((op) => op.path.startsWith("/widgets")) });
      }

      this.store.setDocument(next);
      this.render();
      this.store.appendLog({
        event,
        tier: "agent",
        patches,
        latencyMs: performance.now() - start,
      });
    } finally {
      this.busy = false;
    }
  }
}
