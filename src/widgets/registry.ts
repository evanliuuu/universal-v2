import { WidgetNode, WidgetType } from "../protocol/types";

export type RenderContext = {
  doc: { ui: { rootId: string; widgets: Record<string, WidgetNode> } };
  windows: Record<string, { x: number; y: number; width: number; height: number; title: string; minimized: boolean }>;
};

export type WidgetRenderer = (
  node: WidgetNode,
  ctx: RenderContext,
  renderChild: (id: string) => string,
) => string;

const registry = new Map<WidgetType, WidgetRenderer>();

export function registerWidget(type: WidgetType, renderer: WidgetRenderer) {
  registry.set(type, renderer);
}

export function renderWidget(
  node: WidgetNode,
  ctx: RenderContext,
  renderChild: (id: string) => string,
): string {
  const fn = registry.get(node.type);
  if (!fn) {
    return `<div data-widget-id="${node.id}" class="unknown">Unknown: ${node.type}</div>`;
  }
  return fn(node, ctx, renderChild);
}

function cls(node: WidgetNode, extra = ""): string {
  const base = (node.props.className as string) ?? "";
  return ["uw", `uw-${node.type}`, base, extra].filter(Boolean).join(" ");
}

function dataAttrs(node: WidgetNode): string {
  const behavior = node.behavior ? ` data-behavior="${node.behavior}"` : "";
  return `data-widget-id="${node.id}" data-widget-type="${node.type}"${behavior}`;
}

registerWidget("box", (node, _ctx, renderChild) => {
  const kids = (node.children ?? []).map(renderChild).join("");
  return `<div ${dataAttrs(node)} class="${cls(node)}">${kids}</div>`;
});

registerWidget("text", (node) => {
  const text = String(node.props.text ?? "");
  return `<span ${dataAttrs(node)} class="${cls(node)}">${escapeHtml(text)}</span>`;
});

registerWidget("button", (node) => {
  const label = String(node.props.label ?? "Button");
  const title = node.props.title ? ` title="${escapeHtml(String(node.props.title))}"` : "";
  return `<button type="button" ${dataAttrs(node)} class="${cls(node)}"${title}>${escapeHtml(label)}</button>`;
});

registerWidget("input", (node) => {
  const placeholder = node.props.placeholder
    ? ` placeholder="${escapeHtml(String(node.props.placeholder))}"`
    : "";
  const value = escapeHtml(String(node.props.value ?? ""));
  if (node.props.multiline) {
    return `<textarea ${dataAttrs(node)} class="${cls(node)}"${placeholder}>${value}</textarea>`;
  }
  return `<input ${dataAttrs(node)} class="${cls(node)}" type="text" value="${value}"${placeholder} />`;
});

registerWidget("label", (node) => {
  const text = String(node.props.text ?? "");
  return `<label ${dataAttrs(node)} class="${cls(node)}">${escapeHtml(text)}</label>`;
});

registerWidget("list", (node) => {
  const items = (node.props.items as Array<{ id?: string; label?: string } | string>) ?? [];
  const lis = items
    .map((item) => {
      const label = typeof item === "string" ? item : (item.label ?? "");
      const id = typeof item === "string" ? "" : (item.id ?? "");
      return `<li class="uw-list-item" data-item-id="${escapeHtml(id)}">${escapeHtml(label)}</li>`;
    })
    .join("");
  return `<ul ${dataAttrs(node)} class="${cls(node)}">${lis}</ul>`;
});

registerWidget("tabs", (node, ctx, renderChild) => {
  const tabs = (node.props.tabs as Array<{ id: string; label: string }>) ?? [];
  const active = String(node.props.activeTab ?? tabs[0]?.id ?? "");
  const tabBar = tabs
    .map(
      (t) =>
        `<button type="button" class="uw-tab-btn${t.id === active ? " active" : ""}" data-widget-id="tab-${t.id}" data-widget-type="button" data-behavior="local">${escapeHtml(t.label)}</button>`,
    )
    .join("");
  const panels = (node.children ?? [])
    .map((childId) => {
      const suffix = childId.includes("-") ? childId.split("-").slice(-1)[0] : childId;
      const hidden = suffix !== active ? "hidden-tab-panel" : "";
      return `<div class="uw-tab-panel ${hidden}">${renderChild(childId)}</div>`;
    })
    .join("");
  return `<div ${dataAttrs(node)} class="${cls(node, "uw-tabs")}"><div class="uw-tab-bar">${tabBar}</div><div class="uw-tab-panels">${panels}</div></div>`;
});

registerWidget("table", (node) => {
  const columns = (node.props.columns as string[]) ?? [];
  const rows = (node.props.rows as string[][]) ?? [];
  const head = columns.map((c) => `<th>${escapeHtml(c)}</th>`).join("");
  const body = rows
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${escapeHtml(String(cell))}</td>`).join("")}</tr>`,
    )
    .join("");
  return `<table ${dataAttrs(node)} class="${cls(node)}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
});

registerWidget("form", (node, _ctx, renderChild) => {
  const kids = (node.children ?? []).map(renderChild).join("");
  return `<form ${dataAttrs(node)} class="${cls(node)}" onsubmit="return false">${kids}</form>`;
});

registerWidget("checkbox", (node) => {
  const label = String(node.props.label ?? "");
  const checked = node.props.checked ? " checked" : "";
  return `<label ${dataAttrs(node)} class="${cls(node, "uw-checkbox")}"><input type="checkbox"${checked} /> ${escapeHtml(label)}</label>`;
});

registerWidget("window", (node, ctx, renderChild) => {
  const winId = String(node.props.windowId ?? "");
  const win = ctx.windows[winId];
  if (!win || win.minimized) return "";

  const kids = (node.children ?? []).map(renderChild).join("");
  const title = escapeHtml(String(node.props.title ?? win.title ?? "Window"));
  const style = `left:${win.x}px;top:${win.y}px;width:${win.width}px;height:${win.height}px`;

  return `<div ${dataAttrs(node)} class="${cls(node, "uw-window-chrome")}" style="${style}" data-window-id="${winId}">
    <div class="uw-titlebar">
      <div class="uw-window-controls"><span class="close" data-action="close-window" data-window-id="${winId}"></span></div>
      <div class="uw-window-title">${title}</div>
    </div>
    <div class="uw-window-body">${kids}</div>
  </div>`;
});

export function renderTree(ctx: RenderContext): string {
  const root = ctx.doc.ui.widgets[ctx.doc.ui.rootId];
  if (!root) return "<div>Missing root</div>";

  const seen = new Set<string>();
  function renderChild(id: string): string {
    if (seen.has(id)) return "";
    seen.add(id);
    const node = ctx.doc.ui.widgets[id];
    if (!node) return "";
    return renderWidget(node, ctx, renderChild);
  }

  return renderChild(root.id);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export { escapeHtml };
