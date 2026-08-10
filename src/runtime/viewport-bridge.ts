import { renderTree, VIEWPORT_CSS } from "./renderer";
import { UniversalDocument } from "../state/patch";
import { WidgetNode } from "../protocol/types";
import { diffWidgets } from "../state/widget-diff";

export class ViewportBridge {
  private booted = false;
  private ready = false;
  private readyWaiters: Array<() => void> = [];
  private prevWidgets: Record<string, WidgetNode> | null = null;
  private iframe: HTMLIFrameElement | null = null;

  mount(iframe: HTMLIFrameElement, doc: UniversalDocument) {
    this.iframe = iframe;
    if (!this.booted) {
      this.booted = true;
      this.ready = false;
      iframe.src = "/viewport.html";
    }
    void this.whenReady().then(() => this.update(doc));
  }

  reset() {
    this.prevWidgets = null;
    this.booted = false;
    this.ready = false;
    if (this.iframe) this.iframe.src = "about:blank";
  }

  markReady() {
    this.ready = true;
    for (const fn of this.readyWaiters) fn();
    this.readyWaiters = [];
  }

  private whenReady(): Promise<void> {
    if (this.ready) return Promise.resolve();
    return new Promise((resolve) => this.readyWaiters.push(resolve));
  }

  private post(message: object) {
    this.iframe?.contentWindow?.postMessage(
      { target: "universal-viewport", ...message },
      "*",
    );
  }

  update(doc: UniversalDocument) {
    const ctx = {
      doc: { ui: doc.ui },
      windows: doc.state.windows,
    };

    const { fullRender, patches } = diffWidgets(this.prevWidgets, ctx);

    if (!this.prevWidgets || fullRender) {
      this.post({
        type: "FULL",
        css: VIEWPORT_CSS,
        html: renderTree(ctx),
      });
    } else if (patches.length) {
      this.post({ type: "PATCH", patches });
    }

    this.prevWidgets = structuredClone(doc.ui.widgets);
  }
}

export const viewportBridge = new ViewportBridge();
