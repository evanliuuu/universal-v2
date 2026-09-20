import { renderTree } from "../widgets/registry";
import { VIEWPORT_CSS } from "./renderer";
import { UniversalDocument } from "../state/patch";
import { WidgetNode, WindowState } from "../protocol/types";
import { diffWidgets } from "../state/widget-diff";
import { detectDrift } from "../state/drift";
import { normalizeTheme, themeVariables } from "../themes/index";

export type DriftStats = {
  events: number;
  lastReason?: string;
};

export type ViewportPaintStats = {
  fullRenders: number;
  patchBatches: number;
  patchesSent: number;
};

function windowVisibilityKey(windows: Record<string, WindowState>): string {
  return Object.values(windows)
    .map((win) => `${win.id}:${win.minimized ? 1 : 0}`)
    .sort()
    .join(",");
}

function scheduleFrame(fn: () => void): number {
  if (typeof requestAnimationFrame === "function") {
    return requestAnimationFrame(fn);
  }
  return Number(setTimeout(fn, 0));
}

function cancelFrame(id: number) {
  if (typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(id);
    return;
  }
  clearTimeout(id);
}

export class ViewportBridge {
  private booted = false;
  private ready = false;
  private readyWaiters: Array<() => void> = [];
  private prevWidgets: Record<string, WidgetNode> | null = null;
  private iframe: HTMLIFrameElement | null = null;
  private driftEvents = 0;
  private lastDriftReason?: string;
  private currentTheme = "cupertino";
  private currentThemeVars = "";
  private windowVisibility = "";
  private pending: UniversalDocument | null = null;
  private raf = 0;
  private fullRenders = 0;
  private patchBatches = 0;
  private patchesSent = 0;

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
    if (this.raf) cancelFrame(this.raf);
    this.raf = 0;
    this.pending = null;
    this.prevWidgets = null;
    this.booted = false;
    this.ready = false;
    this.driftEvents = 0;
    this.lastDriftReason = undefined;
    this.currentTheme = "cupertino";
    this.currentThemeVars = "";
    this.windowVisibility = "";
    this.fullRenders = 0;
    this.patchBatches = 0;
    this.patchesSent = 0;
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

  getPaintStats(): ViewportPaintStats {
    return {
      fullRenders: this.fullRenders,
      patchBatches: this.patchBatches,
      patchesSent: this.patchesSent,
    };
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
    this.pending = doc;
    if (this.raf) return;
    this.raf = scheduleFrame(() => {
      this.raf = 0;
      const next = this.pending;
      this.pending = null;
      if (next) this.flush(next);
    });
  }

  private flush(doc: UniversalDocument) {
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
    const themeVars = doc.state.meta.themeVars ?? {};
    const themeVarsKey = JSON.stringify(themeVars);
    const themeChanged =
      theme !== this.currentTheme || themeVarsKey !== this.currentThemeVars;
    if (themeChanged) forceFull = true;
    this.currentTheme = theme;
    this.currentThemeVars = themeVarsKey;

    const visibility = windowVisibilityKey(doc.state.windows);
    if (visibility !== this.windowVisibility) forceFull = true;
    this.windowVisibility = visibility;

    const css = `${VIEWPORT_CSS}\n${themeVariables(theme, themeVars)}`;

    if (!this.prevWidgets || forceFull) {
      this.fullRenders += 1;
      this.post({
        type: "FULL",
        css,
        html: renderTree(ctx),
        theme,
      });
    } else if (patches.length) {
      this.patchBatches += 1;
      this.patchesSent += patches.length;
      this.post({ type: "PATCH", patches, theme });
    }

    this.prevWidgets = structuredClone(doc.ui.widgets);
  }
}

export const viewportBridge = new ViewportBridge();
