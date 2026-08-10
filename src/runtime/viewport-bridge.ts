import { renderTree, VIEWPORT_CSS } from "./renderer";
import { UniversalDocument } from "../state/patch";
import { WidgetNode } from "../protocol/types";
import { diffWidgets } from "../state/widget-diff";
import { detectDrift } from "../state/drift";
import { normalizeTheme, themeVariables } from "../themes/index";

export type DriftStats = {
  events: number;
  lastReason?: string;
};

export class ViewportBridge {
  private booted = false;
  private ready = false;
  private readyWaiters: Array<() => void> = [];
  private prevWidgets: Record<string, WidgetNode> | null = null;
  private iframe: HTMLIFrameElement | null = null;
  private driftEvents = 0;
  private lastDriftReason?: string;
  private currentTheme = "cupertino";

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
    this.driftEvents = 0;
    this.lastDriftReason = undefined;
    if (this.iframe) this.iframe.src = "about:blank";
  }

  markReady() {
    this.ready = true;
    for (const fn of this.readyWaiters) fn();
    this.readyWaiters = [];
  }

  getDriftStats(): DriftStats {
    return { events: this.driftEvents, lastReason: this.lastDriftReason };
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
    const drift = detectDrift(this.prevWidgets, doc.ui.widgets, patches.length);
    let forceFull = fullRender;
    if (drift.drifted) {
      forceFull = true;
      this.driftEvents += 1;
      this.lastDriftReason = drift.reason;
    }

    const theme = normalizeTheme(doc.state.meta.theme);
    const themeChanged = theme !== this.currentTheme;
    if (themeChanged) forceFull = true;
    this.currentTheme = theme;

    const css = `${VIEWPORT_CSS}\n${themeVariables(theme)}`;

    if (!this.prevWidgets || forceFull) {
      this.post({
        type: "FULL",
        css,
        html: renderTree(ctx),
        theme,
      });
    } else if (patches.length) {
      this.post({ type: "PATCH", patches, theme });
    }

    this.prevWidgets = structuredClone(doc.ui.widgets);
  }
}

export const viewportBridge = new ViewportBridge();
