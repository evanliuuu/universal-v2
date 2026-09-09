import { getBudget, DEFAULT_BUDGET } from "../agent/budget";
import { JsonPatchOp, UniversalState } from "../protocol/types";
import { defineApp } from "./registry";

export function settingsWindowPatches(state?: UniversalState): {
  statePatch: JsonPatchOp[];
  uiPatch: JsonPatchOp[];
} {
  const winId = "win-settings";
  const rootId = "settings-root";
  const budget = state ? getBudget(state) : DEFAULT_BUDGET;
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
        height: 420,
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
        children: ["settings-tabs"],
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
          "theme-cupertino",
          "theme-dark",
          "theme-win95",
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
          value: state?.meta.theme ?? "cupertino",
          options: [
            { id: "cupertino", label: "Cupertino" },
            { id: "dark", label: "Dark" },
            { id: "win95", label: "Win95" },
          ],
        },
        behavior: "local",
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
      path: "/widgets/settings-system",
      value: {
        id: "settings-system",
        type: "box",
        props: { className: "settings-panel tab-panel-system hidden-tab-panel" },
        children: ["budget-table", "prefetch-toggle", "ui-scale-slider"],
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
      value: { open: true, activeTab: "general", uiScale: 100 },
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
});
