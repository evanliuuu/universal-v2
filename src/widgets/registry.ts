import { WidgetNode, WidgetType } from "../protocol/types";

export type RenderContext = {
  doc: { ui: { rootId: string; widgets: Record<string, WidgetNode> } };
  windows: Record<
    string,
    {
      x: number;
      y: number;
      width: number;
      height: number;
      title: string;
      minimized: boolean;
    }
  >;
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

function ariaAttrs(node: WidgetNode, extras: Record<string, string | boolean | undefined> = {}): string {
  const props = node.props as Record<string, unknown>;
  const merged: Record<string, string | boolean | undefined> = {
    role: typeof props.role === "string" ? props.role : undefined,
    "aria-label":
      typeof props.ariaLabel === "string"
        ? props.ariaLabel
        : typeof props.title === "string"
          ? props.title
          : undefined,
    ...extras,
  };
  return Object.entries(merged)
    .filter(([, value]) => value !== undefined && value !== false && value !== "")
    .map(([key, value]) =>
      value === true ? ` ${key}` : ` ${key}="${escapeHtml(String(value))}"`,
    )
    .join("");
}

function layoutStyle(node: WidgetNode): string {
  const parts: string[] = [];
  const layout = node.props.layout;
  if (layout === "flex") {
    parts.push("display:flex");
    if (node.props.direction) {
      parts.push(`flex-direction:${String(node.props.direction)}`);
    }
    if (node.props.gap != null) parts.push(`gap:${Number(node.props.gap)}px`);
    if (node.props.align) parts.push(`align-items:${String(node.props.align)}`);
    if (node.props.justify) {
      parts.push(`justify-content:${String(node.props.justify)}`);
    }
  }
  if (layout === "grid") {
    parts.push("display:grid");
    const cols = Number(node.props.columns ?? 2);
    parts.push(`grid-template-columns:repeat(${cols},minmax(0,1fr))`);
    if (node.props.gap != null) parts.push(`gap:${Number(node.props.gap)}px`);
  }
  if (node.props.width != null) parts.push(`width:${node.props.width}`);
  if (node.props.height != null) parts.push(`height:${node.props.height}`);
  return parts.length ? ` style="${parts.join(";")}"` : "";
}

registerWidget("box", (node, _ctx, renderChild) => {
  const kids = (node.children ?? []).map(renderChild).join("");
  return `<div ${dataAttrs(node)} class="${cls(node)}"${ariaAttrs(node)}${layoutStyle(node)}>${kids}</div>`;
});

registerWidget("text", (node) => {
  const text = String(node.props.text ?? "");
  return `<span ${dataAttrs(node)} class="${cls(node)}">${escapeHtml(text)}</span>`;
});

registerWidget("button", (node) => {
  const label = String(node.props.label ?? "Button");
  const title = node.props.title
    ? ` title="${escapeHtml(String(node.props.title))}"`
    : "";
  const ariaLabel =
    node.props.title && String(node.props.title) !== label
      ? String(node.props.title)
      : undefined;
  return `<button type="button" ${dataAttrs(node)} class="${cls(node)}"${title}${ariaAttrs(node, { "aria-label": ariaLabel })}>${escapeHtml(label)}</button>`;
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
  const items =
    (node.props.items as Array<{ id?: string; label?: string } | string>) ??
    [];
  const selected = String(node.props.selectedId ?? "");
  const lis = items
    .map((item) => {
      const label = typeof item === "string" ? item : (item.label ?? "");
      const id = typeof item === "string" ? "" : (item.id ?? "");
      const sel = id && id === selected;
      const selectedAttr = sel ? " selected aria-selected=\"true\"" : " aria-selected=\"false\"";
      return `<li class="uw-list-item${sel ? " selected" : ""}" role="option" tabindex="0" data-item-id="${escapeHtml(id)}"${selectedAttr}>${escapeHtml(label)}</li>`;
    })
    .join("");
  return `<ul ${dataAttrs(node)} class="${cls(node)}" role="listbox"${ariaAttrs(node)}>${lis}</ul>`;
});

registerWidget("tabs", (node, _ctx, renderChild) => {
  const tabs = (node.props.tabs as Array<{ id: string; label: string }>) ?? [];
  const active = String(node.props.activeTab ?? tabs[0]?.id ?? "");
  const tabBar = tabs
    .map(
      (t) =>
        `<button type="button" role="tab" class="uw-tab-btn${t.id === active ? " active" : ""}" data-widget-id="tab-${t.id}" data-widget-type="button" data-behavior="local" aria-selected="${t.id === active ? "true" : "false"}">${escapeHtml(t.label)}</button>`,
    )
    .join("");
  const panels = (node.children ?? [])
    .map((childId) => {
      const suffix = childId.includes("-")
        ? childId.split("-").slice(-1)[0]
        : childId;
      const hidden = suffix !== active ? "hidden-tab-panel" : "";
      return `<div class="uw-tab-panel ${hidden}" role="tabpanel">${renderChild(childId)}</div>`;
    })
    .join("");
  return `<div ${dataAttrs(node)} class="${cls(node, "uw-tabs")}"><div class="uw-tab-bar" role="tablist">${tabBar}</div><div class="uw-tab-panels">${panels}</div></div>`;
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

registerWidget("select", (node) => {
  const options =
    (node.props.options as Array<{ id: string; label: string }>) ?? [];
  const value = String(node.props.value ?? options[0]?.id ?? "");
  const opts = options
    .map((opt) => {
      const selected = opt.id === value ? " selected" : "";
      return `<option value="${escapeHtml(opt.id)}"${selected}>${escapeHtml(opt.label)}</option>`;
    })
    .join("");
  return `<select ${dataAttrs(node)} class="${cls(node)}">${opts}</select>`;
});

registerWidget("slider", (node) => {
  const min = Number(node.props.min ?? 0);
  const max = Number(node.props.max ?? 100);
  const step = Number(node.props.step ?? 1);
  const value = Number(node.props.value ?? min);
  const label = node.props.label
    ? `<span class="uw-slider-label">${escapeHtml(String(node.props.label))}</span>`
    : "";
  return `<label ${dataAttrs(node)} class="${cls(node, "uw-slider")}">${label}<input type="range" min="${min}" max="${max}" step="${step}" value="${value}" aria-valuemin="${min}" aria-valuemax="${max}" aria-valuenow="${value}" /><span class="uw-slider-value">${value}</span></label>`;
});

registerWidget("divider", (node) => {
  return `<hr ${dataAttrs(node)} class="${cls(node)}" role="separator" />`;
});

registerWidget("scroll-area", (node, _ctx, renderChild) => {
  const kids = (node.children ?? []).map(renderChild).join("");
  const maxH = node.props.maxHeight != null
    ? `max-height:${Number(node.props.maxHeight)}px;`
    : "max-height:220px;";
  return `<div ${dataAttrs(node)} class="${cls(node)}" style="overflow:auto;${maxH}">${kids}</div>`;
});

registerWidget("menu", (node) => {
  const items =
    (node.props.items as Array<{ id: string; label: string }>) ?? [];
  const open = Boolean(node.props.open);
  const label = escapeHtml(String(node.props.label ?? "Menu"));
  const list = items
    .map(
      (item) =>
        `<button type="button" class="uw-menu-item" role="menuitem" data-menu-item-id="${escapeHtml(item.id)}">${escapeHtml(item.label)}</button>`,
    )
    .join("");
  return `<div ${dataAttrs(node)} class="${cls(node)}${open ? " open" : ""}">
    <button type="button" class="uw-menu-trigger" data-action="toggle-menu" aria-haspopup="menu" aria-expanded="${open ? "true" : "false"}">${label}</button>
    <div class="uw-menu-panel" role="menu"${open ? "" : " hidden"}>${list}</div>
  </div>`;
});

registerWidget("dialog", (node, _ctx, renderChild) => {
  const open = Boolean(node.props.open);
  const title = escapeHtml(String(node.props.title ?? "Dialog"));
  const kids = (node.children ?? []).map(renderChild).join("");
  return `<div ${dataAttrs(node)} class="${cls(node, "uw-dialog-root")}"${open ? "" : " hidden"}>
    <div class="uw-dialog-backdrop" data-action="close-dialog"></div>
    <div class="uw-dialog-card" role="dialog" aria-modal="true" aria-label="${title}">
      <div class="uw-dialog-header">
        <strong>${title}</strong>
        <button type="button" class="uw-dialog-close" data-action="close-dialog" aria-label="Close ${title}">×</button>
      </div>
      <div class="uw-dialog-body">${kids}</div>
    </div>
  </div>`;
});

registerWidget("icon", (node) => {
  const glyph = escapeHtml(
    String(node.props.glyph ?? node.props.emoji ?? node.props.label ?? "•"),
  );
  const size = Number(node.props.size ?? 24);
  const title = node.props.title
    ? ` title="${escapeHtml(String(node.props.title))}"`
    : "";
  return `<span ${dataAttrs(node)} class="${cls(node)}" role="img"${title}${ariaAttrs(node, { "aria-label": node.props.title ? String(node.props.title) : undefined })} style="font-size:${size}px;line-height:1;display:inline-flex;align-items:center;justify-content:center">${glyph}</span>`;
});

registerWidget("image", (node) => {
  const src = escapeHtml(String(node.props.src ?? ""));
  const alt = escapeHtml(String(node.props.alt ?? ""));
  const width = node.props.width != null ? ` width="${Number(node.props.width)}"` : "";
  const height =
    node.props.height != null ? ` height="${Number(node.props.height)}"` : "";
  return `<img ${dataAttrs(node)} class="${cls(node)}" src="${src}" alt="${alt}"${width}${height} />`;
});

registerWidget("window", (node, ctx, renderChild) => {
  const winId = String(node.props.windowId ?? "");
  const win = ctx.windows[winId];
  if (!win || win.minimized) return "";

  const kids = (node.children ?? []).map(renderChild).join("");
  const title = escapeHtml(String(node.props.title ?? win.title ?? "Window"));
  const style = `left:${win.x}px;top:${win.y}px;width:${win.width}px;height:${win.height}px`;

  return `<div ${dataAttrs(node)} class="${cls(node, "uw-window-chrome")}" style="${style}" data-window-id="${winId}" role="dialog" aria-label="${title}" tabindex="-1">
    <div class="uw-titlebar">
      <div class="uw-window-controls"><button type="button" class="close" data-action="close-window" data-window-id="${winId}" aria-label="Close ${title}"></button></div>
      <div class="uw-window-title">${title}</div>
    </div>
    <div class="uw-window-body">${kids}</div>
    <div class="uw-resize-handle" data-action="resize-window" data-window-id="${winId}"></div>
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
