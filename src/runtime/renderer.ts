import { renderTree } from "../widgets/registry";
import { UniversalDocument } from "../state/patch";
import { viewportBridge } from "./viewport-bridge";

const VIEWPORT_CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; font-family: var(--uw-font, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif); color: var(--uw-text, #111); }
  body { background: var(--uw-bg, linear-gradient(135deg, #1a6fa8 0%, #4aadce 50%, #87ceeb 100%)); overflow: hidden; }
  .uw-screen { display: flex; flex-direction: column; height: 100vh; width: 100vw; }
  .uw-menubar { display: flex; justify-content: space-between; align-items: center; padding: 6px 14px; background: var(--uw-menubar-bg, rgba(255,255,255,0.72)); backdrop-filter: blur(12px); font-size: 13px; }
  .uw-desktop { flex: 1; position: relative; }
  .uw-dock { display: flex; justify-content: center; gap: 10px; padding: 8px 14px 12px; }
  .uw-dock > .uw-box { display: flex; gap: 10px; padding: 8px 14px; background: var(--uw-dock-bg, rgba(255,255,255,0.75)); backdrop-filter: blur(12px); border-radius: 14px; box-shadow: 0 4px 16px rgba(0,0,0,0.18); }
  .uw-dock-icon { font-size: 28px; min-width: 44px; min-height: 44px; border: none; background: transparent; cursor: pointer; border-radius: 10px; transition: transform 0.15s; }
  .uw-dock-icon:hover { transform: scale(1.12); background: rgba(0,0,0,0.06); }
  .uw-window-chrome { position: absolute; background: var(--uw-window-bg, #fff); border-radius: 10px; box-shadow: 0 12px 40px rgba(0,0,0,0.28); display: flex; flex-direction: column; overflow: hidden; }
  .uw-titlebar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--uw-titlebar-bg, #f0f0f0); border-bottom: 1px solid #ddd; color: var(--uw-text, #111); }
  .uw-window-controls .close { display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: #ff5f57; cursor: pointer; }
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
  .uw-list-item { padding: 8px 10px; border-radius: 6px; background: #f5f5f7; border: 1px solid #e5e5ea; }
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
  body[data-theme="win95"] .uw-window-chrome { border-radius: 0; border: 2px outset #fff; }
  body[data-theme="win95"] .uw-titlebar { color: #fff; }
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
