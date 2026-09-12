import { renderTree } from "../widgets/registry";
import { UniversalDocument } from "../state/patch";
import { viewportBridge } from "./viewport-bridge";

export { renderTree };
const VIEWPORT_CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; font-family: var(--uw-font, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif); color: var(--uw-text, #111); }
  body { background: var(--uw-bg, linear-gradient(135deg, #1a6fa8 0%, #4aadce 50%, #87ceeb 100%)); overflow: hidden; }
  .uw-screen, .screen { display: flex; flex-direction: column; height: 100vh; width: 100%; container-type: inline-size; container-name: desktop; }
  .uw-menubar, .menubar { display: flex; justify-content: space-between; align-items: center; padding: 6px 14px; background: var(--uw-menubar-bg, rgba(255,255,255,0.72)); backdrop-filter: blur(12px); font-size: 13px; }
  .uw-desktop, .desktop { flex: 1; position: relative; min-height: 0; }
  .uw-dock, .dock { display: flex; justify-content: center; flex-wrap: nowrap; gap: 10px; padding: 8px 14px 12px; background: var(--uw-dock-bg, rgba(255,255,255,0.75)); backdrop-filter: blur(12px); border-radius: 14px; box-shadow: 0 4px 16px rgba(0,0,0,0.18); margin: 0 auto 10px; }
  .uw-dock-icon { font-size: 28px; min-width: 44px; min-height: 44px; border: none; background: transparent; cursor: pointer; border-radius: 10px; transition: transform 0.15s; }
  .uw-dock-icon:hover { transform: scale(1.12); background: rgba(0,0,0,0.06); }
  :focus-visible { outline: 3px solid var(--uw-accent, #007aff); outline-offset: 2px; }
  .uw-window-chrome:focus-visible { outline: 3px solid var(--uw-accent, #007aff); outline-offset: 2px; }
  .uw-window-chrome { position: absolute; background: var(--uw-window-bg, #fff); border-radius: 10px; box-shadow: 0 12px 40px rgba(0,0,0,0.28); display: flex; flex-direction: column; overflow: hidden; }
  .uw-titlebar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--uw-titlebar-bg, #f0f0f0); border-bottom: 1px solid #ddd; color: var(--uw-text, #111); }
  .uw-window-controls .close { display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: #ff5f57; cursor: pointer; border: none; padding: 0; }
  .uw-window-title { flex: 1; text-align: center; font-size: 13px; font-weight: 600; }
  .uw-window-body { flex: 1; padding: 12px; overflow: auto; display: flex; flex-direction: column; gap: 8px; }
  .uw-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .uw-toolbar-btn { border: 1px solid #ccc; background: #f8f8f8; border-radius: 6px; padding: 4px 10px; cursor: pointer; }
  .uw-toolbar-label { flex: 1; text-align: center; font-weight: 600; }
  .uw-calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
  .uw-day-cell { border: 1px solid #e0e0e0; background: #fafafa; border-radius: 6px; padding: 10px; cursor: pointer; }
  .uw-day-cell.selected { background: var(--uw-accent, #007aff); color: white; border-color: var(--uw-accent, #007aff); }
  .uw-input, textarea.uw-input { width: 100%; min-height: 180px; border: 1px solid #ccc; border-radius: 8px; padding: 10px; font: inherit; resize: vertical; }
  .uw-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .uw-list-item { padding: 8px 10px; border-radius: 6px; background: #f5f5f7; border: 1px solid #e5e5ea; cursor: pointer; }
  .uw-list-item.selected { background: var(--uw-accent, #007aff); color: white; border-color: var(--uw-accent, #007aff); }
  .uw-files-preview { white-space: pre-wrap; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; padding: 10px; border: 1px solid #e5e5ea; border-radius: 8px; min-height: 140px; }
  .uw-label { font-size: 12px; font-weight: 600; color: #555; text-transform: uppercase; letter-spacing: 0.04em; }
  .uw-tabs { display: flex; flex-direction: column; gap: 12px; }
  .uw-tab-bar { display: flex; gap: 6px; border-bottom: 1px solid #ddd; padding-bottom: 8px; }
  .uw-tab-btn { border: none; background: transparent; padding: 6px 12px; border-radius: 6px; cursor: pointer; font: inherit; }
  .uw-tab-btn.active { background: var(--uw-accent, #007aff); color: white; }
  .uw-tab-panel.hidden-tab-panel { display: none; }
  .uw-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .uw-table th, .uw-table td { border: 1px solid #e0e0e0; padding: 8px 10px; text-align: left; }
  .uw-table th { background: #f5f5f7; }
  .uw-form { display: flex; flex-direction: column; gap: 10px; }
  .uw-form .theme-btn { align-self: flex-start; }
  .uw-checkbox { display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }
  .uw-select { align-self: flex-start; min-width: 160px; padding: 6px 8px; border: 1px solid #ccc; border-radius: 6px; font: inherit; background: #fff; color: inherit; }
  .uw-slider { display: flex; align-items: center; gap: 10px; font-size: 13px; }
  .uw-slider input[type=range] { flex: 1; }
  .uw-slider-value { min-width: 2.5em; text-align: right; font-variant-numeric: tabular-nums; }
  .uw-divider { border: none; border-top: 1px solid #ddd; margin: 8px 0; width: 100%; }
  .uw-scroll-area { overflow: auto; border: 1px solid #e5e5ea; border-radius: 8px; background: rgba(255,255,255,0.4); }
  .uw-menu { position: relative; display: inline-block; }
  .uw-menu-trigger { border: 1px solid #ccc; background: #f8f8f8; border-radius: 6px; padding: 4px 10px; cursor: pointer; font: inherit; }
  .uw-menu-panel { position: absolute; top: calc(100% + 4px); left: 0; min-width: 160px; background: var(--uw-window-bg, #fff); border: 1px solid #ddd; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.16); padding: 4px; z-index: 20; display: flex; flex-direction: column; gap: 2px; }
  .uw-menu-panel[hidden] { display: none; }
  .uw-menu-item { border: none; background: transparent; text-align: left; padding: 8px 10px; border-radius: 6px; cursor: pointer; font: inherit; color: inherit; }
  .uw-menu-item:hover { background: rgba(0,0,0,0.06); }
  .uw-dialog-root { position: fixed; inset: 0; z-index: 40; display: flex; align-items: center; justify-content: center; }
  .uw-dialog-backdrop { position: absolute; inset: 0; background: rgba(0,0,0,0.35); }
  .uw-dialog-card { position: relative; min-width: 280px; max-width: 420px; background: var(--uw-window-bg, #fff); color: var(--uw-text, #111); border-radius: 10px; box-shadow: 0 16px 48px rgba(0,0,0,0.28); overflow: hidden; }
  .uw-dialog-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; background: var(--uw-titlebar-bg, #f0f0f0); }
  .uw-dialog-close { border: none; background: transparent; font-size: 18px; cursor: pointer; color: inherit; }
  .uw-dialog-body { padding: 12px; }
  .uw-icon { user-select: none; }
  .uw-image { max-width: 100%; border-radius: 8px; display: block; object-fit: cover; }
  .uw-resize-handle { position: absolute; right: 0; bottom: 0; width: 14px; height: 14px; cursor: nwse-resize; background: linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.25) 50%); }
  body[data-theme="win95"] .uw-window-chrome { border-radius: 0; border: 2px outset #fff; }
  body[data-theme="win95"] .uw-titlebar { color: #fff; }
  body[data-theme="material"] .uw-titlebar { color: #fff; }
  body[data-theme="high-contrast"] .uw-window-chrome { border: 2px solid #ffff00; border-radius: 0; }
  body[data-theme="high-contrast"] .uw-titlebar { color: #000; }
  @container desktop (max-width: 640px) {
    .uw-desktop, .desktop { overflow: auto; display: flex; flex-direction: column; gap: 10px; padding: 8px; }
    .uw-window-chrome { position: relative !important; left: 0 !important; top: 0 !important; width: 100% !important; height: auto !important; min-height: 220px; max-width: 100%; }
    .uw-resize-handle { display: none; }
    .uw-dock, .dock { flex-wrap: wrap; justify-content: center; gap: 4px; padding: 6px 8px; max-width: calc(100% - 16px); }
    .uw-dock-icon, .dock-icon { min-width: 40px; min-height: 40px; font-size: 24px; }
    .uw-dialog-card { min-width: 0; max-width: calc(100cqi - 24px); }
  }
`;

export { VIEWPORT_CSS };

export function buildViewportHtml(doc: UniversalDocument): string {
  const body = renderTree({
    doc: { ui: doc.ui },
    windows: doc.state.windows,
  });

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>${VIEWPORT_CSS}</style></head>
<body>${body}
<script>
  document.addEventListener('click', (e) => {
    const close = e.target.closest('[data-action="close-window"]');
    if (close) {
      parent.postMessage({ source: 'universal-viewport', type: 'close_window', windowId: close.dataset.windowId }, '*');
      return;
    }
    const el = e.target.closest('[data-widget-id]');
    if (!el) return;
    parent.postMessage({
      source: 'universal-viewport',
      type: 'click',
      targetId: el.dataset.widgetId,
      widgetType: el.dataset.widgetType,
      behavior: el.dataset.behavior || 'agent',
    }, '*');
  });
  document.addEventListener('input', (e) => {
    const el = e.target.closest('[data-widget-id]');
    if (!el) return;
    const value = el.value ?? el.textContent ?? '';
    parent.postMessage({
      source: 'universal-viewport',
      type: 'input',
      targetId: el.dataset.widgetId,
      value,
      behavior: el.dataset.behavior || 'local',
    }, '*');
  });
</script>
</body></html>`;
}

export function mountViewport(iframe: HTMLIFrameElement, doc: UniversalDocument) {
  viewportBridge.mount(iframe, doc);
}
