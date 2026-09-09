import { getBudget, DEFAULT_BUDGET } from "../agent/budget";
import { ACCENT_OPTIONS, themeOptions } from "../themes/index";
import { JsonPatchOp, UniversalState } from "../protocol/types";
import { defineApp } from "./registry";

export function settingsWindowPatches(state?: UniversalState): {
  statePatch: JsonPatchOp[];
  uiPatch: JsonPatchOp[];
} {
  const winId = "win-settings";
  const rootId = "settings-root";
  const budget = state ? getBudget(state) : DEFAULT_BUDGET;
  const theme = state?.meta.theme ?? "cupertino";
  const statePatch: JsonPatchOp[] = [
    {
      op: "add",
      path: `/windows/${winId}`,
      value: {
        id: winId,
        title: "Settings",
        x: 160,
        y: 100,
        width: 560,
        height: 440,
        rootId,
        minimized: false,
      },
    },
    {
      op: "add",
      path: `/widgets/${rootId}`,
      value: {
        id: rootId,
        type: "window",
        props: { title: "Settings", windowId: winId },
        children: ["settings-tabs", "about-dialog"],
      },
    },
    {
      op: "add",
      path: "/widgets/settings-tabs",
      value: {
        id: "settings-tabs",
        type: "tabs",
        props: {
          activeTab: "general",
          tabs: [
            { id: "general", label: "General" },
            { id: "system", label: "System" },
          ],
        },
        children: ["settings-general", "settings-system"],
      },
    },
    {
      op: "add",
      path: "/widgets/settings-general",
      value: {
        id: "settings-general",
        type: "form",
        props: { className: "settings-form tab-panel-general" },
        children: [
          "theme-label",
          "theme-select",
          "theme-btn-row",
          "settings-divider",
          "settings-actions-menu",
        ],
      },
    },
    {
      op: "add",
      path: "/widgets/theme-label",
      value: {
        id: "theme-label",
        type: "label",
        props: { text: "Theme", className: "" },
      },
    },
    {
      op: "add",
      path: "/widgets/theme-select",
      value: {
        id: "theme-select",
        type: "select",
        props: {
          value: theme,
          options: themeOptions(),
        },
        behavior: "local",
      },
    },
    {
      op: "add",
      path: "/widgets/theme-btn-row",
      value: {
        id: "theme-btn-row",
        type: "box",
        props: {
          layout: "flex",
          gap: 8,
          className: "theme-btn-row",
        },
        children: ["theme-cupertino", "theme-dark", "theme-win95"],
      },
    },
    {
      op: "add",
      path: "/widgets/theme-cupertino",
      value: {
        id: "theme-cupertino",
        type: "button",
        props: { label: "Cupertino", className: "theme-btn" },
        behavior: "local",
      },
    },
    {
      op: "add",
      path: "/widgets/theme-dark",
      value: {
        id: "theme-dark",
        type: "button",
        props: { label: "Dark", className: "theme-btn" },
        behavior: "local",
      },
    },
    {
      op: "add",
      path: "/widgets/theme-win95",
      value: {
        id: "theme-win95",
        type: "button",
        props: { label: "Win95", className: "theme-btn" },
        behavior: "local",
      },
    },
    {
      op: "add",
      path: "/widgets/settings-divider",
      value: {
        id: "settings-divider",
        type: "divider",
        props: {},
      },
    },
    {
      op: "add",
      path: "/widgets/settings-actions-menu",
      value: {
        id: "settings-actions-menu",
        type: "menu",
        props: {
          label: "Actions",
          open: false,
          items: [{ id: "about", label: "About Universal" }],
        },
        behavior: "local",
      },
    },
    {
      op: "add",
      path: "/widgets/settings-system",
      value: {
        id: "settings-system",
        type: "box",
        props: {
          className: "settings-panel tab-panel-system hidden-tab-panel",
          layout: "flex",
          direction: "column",
          gap: 10,
        },
        children: [
          "budget-table",
          "prefetch-toggle",
          "ui-scale-slider",
          "accent-label",
          "accent-select",
        ],
      },
    },
    {
      op: "add",
      path: "/widgets/budget-table",
      value: {
        id: "budget-table",
        type: "table",
        props: {
          columns: ["Setting", "Value"],
          rows: [
            ["Token limit", String(budget.tokenLimit)],
            ["Tokens used", String(budget.tokensUsed)],
            ["Prefetch", budget.prefetchEnabled ? "enabled" : "disabled"],
          ],
        },
      },
    },
    {
      op: "add",
      path: "/widgets/prefetch-toggle",
      value: {
        id: "prefetch-toggle",
        type: "checkbox",
        props: {
          label: "Enable speculative prefetch",
          checked: budget.prefetchEnabled,
        },
        behavior: "local",
      },
    },
    {
      op: "add",
      path: "/widgets/ui-scale-slider",
      value: {
        id: "ui-scale-slider",
        type: "slider",
        props: {
          label: "UI scale",
          min: 80,
          max: 140,
          step: 10,
          value: 100,
        },
        behavior: "local",
      },
    },
    {
      op: "add",
      path: "/widgets/accent-label",
      value: {
        id: "accent-label",
        type: "label",
        props: { text: "Custom accent" },
      },
    },
    {
      op: "add",
      path: "/widgets/accent-select",
      value: {
        id: "accent-select",
        type: "select",
        props: {
          value: state?.meta.themeVars?.["--uw-accent"] ?? "#007aff",
          options: ACCENT_OPTIONS.map((opt) => ({
            id: opt.id,
            label: opt.label,
          })),
        },
        behavior: "local",
      },
    },
    {
      op: "add",
      path: "/widgets/about-dialog",
      value: {
        id: "about-dialog",
        type: "dialog",
        props: { title: "About", open: false },
        children: ["about-dialog-content"],
        behavior: "local",
      },
    },
    {
      op: "add",
      path: "/widgets/about-dialog-content",
      value: {
        id: "about-dialog-content",
        type: "box",
        props: { layout: "flex", direction: "column", gap: 10 },
        children: ["about-icon", "about-mark", "about-dialog-body"],
      },
    },
    {
      op: "add",
      path: "/widgets/about-icon",
      value: {
        id: "about-icon",
        type: "icon",
        props: { glyph: "🤖", size: 36, title: "Universal" },
      },
    },
    {
      op: "add",
      path: "/widgets/about-mark",
      value: {
        id: "about-mark",
        type: "image",
        props: {
          alt: "Universal mark",
          width: 64,
          height: 64,
          src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Crect fill='%23007aff' width='64' height='64' rx='12'/%3E%3Ctext x='32' y='42' text-anchor='middle' fill='white' font-size='28' font-family='sans-serif'%3EU%3C/text%3E%3C/svg%3E",
        },
      },
    },
    {
      op: "add",
      path: "/widgets/about-dialog-body",
      value: {
        id: "about-dialog-body",
        type: "text",
        props: {
          text: "Universal v2 — desktop UI driven by JSON state and patches.",
        },
      },
    },
    {
      op: "add",
      path: "/widgets/desktop/children/-",
      value: rootId,
    },
    {
      op: "replace",
      path: "/focus",
      value: { windowId: winId, widgetId: "dock-settings" },
    },
    {
      op: "add",
      path: "/apps/settings",
      value: {
        open: true,
        activeTab: "general",
        uiScale: 100,
        aboutOpen: false,
        actionsMenuOpen: false,
      },
    },
    {
      op: "add",
      path: "/handlers/focus-settings",
      value: {
        match: { type: "click", targetId: "dock-settings" },
        when: "!!state.windows['win-settings']",
        statePatch: [
          {
            op: "replace",
            path: "/focus",
            value: { windowId: winId, widgetId: "dock-settings" },
          },
        ],
        uiPatch: [],
      },
    },
  ];
  const uiPatch = statePatch.filter((op) => op.path.startsWith("/widgets"));
  return { statePatch, uiPatch };
}

defineApp({
  id: "settings",
  title: "Settings",
  dockId: "dock-settings",
  windowId: "win-settings",
  dockLabel: "⚙️",
  dockTitle: "Settings",
  aliases: ["setting"],
  open: (state) => settingsWindowPatches(state),
  reflex: (doc, event) => {
    if (event.type === "click" && event.targetId?.startsWith("tab-")) {
      const tab = event.targetId.replace("tab-", "");
      const generalClass =
        tab === "general"
          ? "settings-form tab-panel-general"
          : "settings-form tab-panel-general hidden-tab-panel";
      const systemClass =
        tab === "system"
          ? "settings-panel tab-panel-system"
          : "settings-panel tab-panel-system hidden-tab-panel";
      return {
        handled: true,
        statePatch: [
          { op: "replace", path: "/widgets/settings-tabs/props/activeTab", value: tab },
          { op: "replace", path: "/apps/settings/activeTab", value: tab },
          {
            op: "replace",
            path: "/widgets/settings-general/props/className",
            value: generalClass,
          },
          {
            op: "replace",
            path: "/widgets/settings-system/props/className",
            value: systemClass,
          },
        ],
        uiPatch: [
          { op: "replace", path: "/widgets/settings-tabs/props/activeTab", value: tab },
          {
            op: "replace",
            path: "/widgets/settings-general/props/className",
            value: generalClass,
          },
          {
            op: "replace",
            path: "/widgets/settings-system/props/className",
            value: systemClass,
          },
        ],
      };
    }

    if (event.type === "input" && event.targetId === "prefetch-toggle") {
      const enabled = event.value === true || event.value === "true";
      const budget = getBudget(doc.state);
      const rows = [
        ["Token limit", String(budget.tokenLimit)],
        ["Tokens used", String(budget.tokensUsed)],
        ["Prefetch", enabled ? "enabled" : "disabled"],
      ];
      return {
        handled: true,
        statePatch: [
          { op: "replace", path: "/meta/budget/prefetchEnabled", value: enabled },
        ],
        uiPatch: [
          { op: "replace", path: "/widgets/prefetch-toggle/props/checked", value: enabled },
          { op: "replace", path: "/widgets/budget-table/props/rows", value: rows },
        ],
      };
    }

    if (
      event.type === "input" &&
      event.targetId === "theme-select" &&
      typeof event.value === "string"
    ) {
      return {
        handled: true,
        statePatch: [
          { op: "replace", path: "/meta/theme", value: event.value },
          { op: "replace", path: "/widgets/theme-select/props/value", value: event.value },
        ],
        uiPatch: [
          { op: "replace", path: "/widgets/theme-select/props/value", value: event.value },
        ],
      };
    }

    if (event.type === "input" && event.targetId === "ui-scale-slider") {
      const scale = Number(event.value);
      if (!Number.isFinite(scale)) return null;
      return {
        handled: true,
        statePatch: [
          { op: "replace", path: "/widgets/ui-scale-slider/props/value", value: scale },
          { op: "replace", path: "/apps/settings/uiScale", value: scale },
        ],
        uiPatch: [
          { op: "replace", path: "/widgets/ui-scale-slider/props/value", value: scale },
        ],
      };
    }

    if (
      event.type === "input" &&
      event.targetId === "accent-select" &&
      typeof event.value === "string"
    ) {
      const themeVars = {
        ...(doc.state.meta.themeVars ?? {}),
        "--uw-accent": event.value,
      };
      return {
        handled: true,
        statePatch: [
          { op: "replace", path: "/meta/themeVars", value: themeVars },
          { op: "replace", path: "/meta/theme", value: "custom" },
          { op: "replace", path: "/widgets/accent-select/props/value", value: event.value },
          { op: "replace", path: "/widgets/theme-select/props/value", value: "custom" },
        ],
        uiPatch: [
          { op: "replace", path: "/widgets/accent-select/props/value", value: event.value },
          { op: "replace", path: "/widgets/theme-select/props/value", value: "custom" },
        ],
      };
    }

    if (
      event.type === "click" &&
      event.targetId?.startsWith("theme-") &&
      event.targetId !== "theme-select" &&
      event.targetId !== "theme-label"
    ) {
      const theme = event.targetId.replace("theme-", "");
      const patches = [
        { op: "replace" as const, path: "/meta/theme", value: theme },
      ];
      if (doc.state.widgets["theme-select"]) {
        patches.push({
          op: "replace",
          path: "/widgets/theme-select/props/value",
          value: theme,
        });
      }
      return {
        handled: true,
        statePatch: patches,
        uiPatch: patches.filter((op) => op.path.startsWith("/widgets")),
      };
    }

    if (event.type === "click" && event.targetId === "settings-actions-menu") {
      const widget = doc.state.widgets["settings-actions-menu"];
      if (!widget) return null;
      if (event.value === "toggle") {
        const open = !Boolean(widget.props.open);
        return {
          handled: true,
          statePatch: [
            { op: "replace", path: "/widgets/settings-actions-menu/props/open", value: open },
            { op: "replace", path: "/apps/settings/actionsMenuOpen", value: open },
          ],
          uiPatch: [
            { op: "replace", path: "/widgets/settings-actions-menu/props/open", value: open },
          ],
        };
      }
      if (event.value === "about") {
        return {
          handled: true,
          statePatch: [
            { op: "replace", path: "/widgets/settings-actions-menu/props/open", value: false },
            { op: "replace", path: "/widgets/about-dialog/props/open", value: true },
            { op: "replace", path: "/apps/settings/aboutOpen", value: true },
            { op: "replace", path: "/apps/settings/actionsMenuOpen", value: false },
          ],
          uiPatch: [
            { op: "replace", path: "/widgets/settings-actions-menu/props/open", value: false },
            { op: "replace", path: "/widgets/about-dialog/props/open", value: true },
          ],
        };
      }
    }

    if (
      event.type === "click" &&
      event.targetId === "about-dialog" &&
      (event.value === "close" || event.value === undefined)
    ) {
      return {
        handled: true,
        statePatch: [
          { op: "replace", path: "/widgets/about-dialog/props/open", value: false },
          { op: "replace", path: "/apps/settings/aboutOpen", value: false },
        ],
        uiPatch: [
          { op: "replace", path: "/widgets/about-dialog/props/open", value: false },
        ],
      };
    }

    return null;
  },
});
