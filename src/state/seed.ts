import { UniversalState, WidgetNode } from "../protocol/types";
import { getBudget, DEFAULT_BUDGET } from "../agent/budget";

function w(node: WidgetNode): WidgetNode {
  return node;
}

/** Seed desktop: menubar, dock, one dock icon that opens calendar via agent. */
export function createSeedState(): UniversalState {
  const widgets: Record<string, WidgetNode> = {
    screen: w({
      id: "screen",
      type: "box",
      props: { className: "screen" },
      children: ["menubar", "desktop", "dock"],
    }),
    menubar: w({
      id: "menubar",
      type: "box",
      props: { className: "menubar" },
      children: ["menubar-left", "menubar-right"],
    }),
    "menubar-left": w({
      id: "menubar-left",
      type: "text",
      props: { text: "🤖 Universal", className: "menubar-section" },
    }),
    "menubar-right": w({
      id: "menubar-right",
      type: "text",
      props: {
        text: new Date().toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        }),
        className: "menubar-section",
      },
    }),
    desktop: w({
      id: "desktop",
      type: "box",
      props: { className: "desktop" },
      children: [],
    }),
    dock: w({
      id: "dock",
      type: "box",
      props: { className: "dock" },
      children: ["dock-calendar", "dock-notes", "dock-settings"],
    }),
    "dock-calendar": w({
      id: "dock-calendar",
      type: "button",
      props: { label: "📅", title: "Calendar", className: "dock-icon" },
      behavior: "agent",
    }),
    "dock-notes": w({
      id: "dock-notes",
      type: "button",
      props: { label: "🗒️", title: "Notes", className: "dock-icon" },
      behavior: "agent",
    }),
    "dock-settings": w({
      id: "dock-settings",
      type: "button",
      props: { label: "⚙️", title: "Settings", className: "dock-icon" },
      behavior: "agent",
    }),
  };

  return {
    meta: {
      theme: "cupertino",
      locale: "en",
      version: 2,
      budget: {
        tokensUsed: 0,
        tokenLimit: 50_000,
        prefetchEnabled: true,
        maxPrefetchPending: 4,
      },
    },
    desktop: { rootId: "screen", dock: ["dock-calendar", "dock-notes", "dock-settings"] },
    windows: {},
    widgets,
    focus: {},
    apps: {},
    handlers: {},
  };
}

export function calendarWindowPatches(): {
  statePatch: import("../protocol/types").JsonPatchOp[];
  uiPatch: import("../protocol/types").JsonPatchOp[];
} {
  const winId = "win-calendar";
  const rootId = "calendar-root";
  const statePatch = [
  {
    op: "add" as const,
    path: `/windows/${winId}`,
    value: {
      id: winId,
      title: "Calendar",
      x: 120,
      y: 96,
      width: 520,
      height: 400,
      rootId,
      minimized: false,
    },
  },
  {
    op: "add" as const,
    path: `/widgets/${rootId}`,
    value: {
      id: rootId,
      type: "window",
      props: { title: "Calendar", windowId: winId },
      children: ["calendar-toolbar", "calendar-body"],
    },
  },
  {
    op: "add" as const,
    path: "/widgets/calendar-toolbar",
    value: {
      id: "calendar-toolbar",
      type: "box",
      props: { className: "toolbar" },
      children: ["cal-prev", "cal-label", "cal-next"],
    },
  },
  {
    op: "add" as const,
    path: "/widgets/cal-prev",
    value: {
      id: "cal-prev",
      type: "button",
      props: { label: "◀", className: "toolbar-btn" },
      behavior: "local",
    },
  },
  {
    op: "add" as const,
    path: "/widgets/cal-label",
    value: {
      id: "cal-label",
      type: "text",
      props: { text: "August 2026", className: "toolbar-label" },
    },
  },
  {
    op: "add" as const,
    path: "/widgets/cal-next",
    value: {
      id: "cal-next",
      type: "button",
      props: { label: "▶", className: "toolbar-btn" },
      behavior: "local",
    },
  },
  {
    op: "add" as const,
    path: "/widgets/calendar-body",
    value: {
      id: "calendar-body",
      type: "box",
      props: { className: "calendar-grid" },
      children: ["day-15"],
    },
  },
  {
    op: "add" as const,
    path: "/widgets/day-15",
    value: {
      id: "day-15",
      type: "button",
      props: { label: "15", className: "day-cell" },
      behavior: "local",
    },
  },
  {
    op: "add" as const,
    path: "/widgets/desktop/children/-",
    value: rootId,
  },
  {
    op: "replace" as const,
    path: "/focus",
    value: { windowId: winId, widgetId: "dock-calendar" },
  },
  {
    op: "add" as const,
    path: "/apps/calendar",
    value: { open: true, selectedDate: null, view: "month" },
  },
  {
    op: "add" as const,
    path: "/handlers/focus-calendar",
    value: {
      match: { type: "click", targetId: "dock-calendar" },
      when: "!!state.windows['win-calendar']",
      statePatch: [
        {
          op: "replace",
          path: "/focus",
          value: { windowId: winId, widgetId: "dock-calendar" },
        },
      ],
      uiPatch: [],
    },
  },
];

  const uiPatch = statePatch.filter((op) => op.path.startsWith("/widgets"));
  return { statePatch, uiPatch };
}

export function notesWindowPatches(): {
  statePatch: import("../protocol/types").JsonPatchOp[];
  uiPatch: import("../protocol/types").JsonPatchOp[];
} {
  const winId = "win-notes";
  const rootId = "notes-root";
  const statePatch = [
    {
      op: "add" as const,
      path: `/windows/${winId}`,
      value: {
        id: winId,
        title: "Notes",
        x: 200,
        y: 120,
        width: 420,
        height: 320,
        rootId,
        minimized: false,
      },
    },
    {
      op: "add" as const,
      path: `/widgets/${rootId}`,
      value: {
        id: rootId,
        type: "window",
        props: { title: "Notes", windowId: winId },
        children: ["notes-input"],
      },
    },
    {
      op: "add" as const,
      path: "/widgets/notes-input",
      value: {
        id: "notes-input",
        type: "input",
        props: {
          placeholder: "Type a note…",
          value: "",
          multiline: true,
        },
        behavior: "local",
      },
    },
    {
      op: "add" as const,
      path: "/widgets/desktop/children/-",
      value: rootId,
    },
    {
      op: "replace" as const,
      path: "/focus",
      value: { windowId: winId, widgetId: "dock-notes" },
    },
    {
      op: "add" as const,
      path: "/apps/notes",
      value: { open: true, body: "" },
    },
    {
      op: "add" as const,
      path: "/handlers/focus-notes",
      value: {
        match: { type: "click", targetId: "dock-notes" },
        when: "!!state.windows['win-notes']",
        statePatch: [
          {
            op: "replace",
            path: "/focus",
            value: { windowId: winId, widgetId: "dock-notes" },
          },
        ],
        uiPatch: [],
      },
    },
  ];
  const uiPatch = statePatch.filter((op) => op.path.startsWith("/widgets"));
  return { statePatch, uiPatch };
}

export function settingsWindowPatches(state?: UniversalState): {
  statePatch: import("../protocol/types").JsonPatchOp[];
  uiPatch: import("../protocol/types").JsonPatchOp[];
} {
  const winId = "win-settings";
  const rootId = "settings-root";
  const budget = state ? getBudget(state) : DEFAULT_BUDGET;
  const statePatch = [
    {
      op: "add" as const,
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
      op: "add" as const,
      path: `/widgets/${rootId}`,
      value: {
        id: rootId,
        type: "window",
        props: { title: "Settings", windowId: winId },
        children: ["settings-tabs"],
      },
    },
    {
      op: "add" as const,
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
      op: "add" as const,
      path: "/widgets/settings-general",
      value: {
        id: "settings-general",
        type: "form",
        props: { className: "settings-form tab-panel-general" },
        children: ["theme-label", "theme-cupertino", "theme-dark", "theme-win95"],
      },
    },
    {
      op: "add" as const,
      path: "/widgets/theme-label",
      value: {
        id: "theme-label",
        type: "label",
        props: { text: "Theme", className: "" },
      },
    },
    {
      op: "add" as const,
      path: "/widgets/theme-cupertino",
      value: {
        id: "theme-cupertino",
        type: "button",
        props: { label: "Cupertino", className: "theme-btn" },
        behavior: "local",
      },
    },
    {
      op: "add" as const,
      path: "/widgets/theme-dark",
      value: {
        id: "theme-dark",
        type: "button",
        props: { label: "Dark", className: "theme-btn" },
        behavior: "local",
      },
    },
    {
      op: "add" as const,
      path: "/widgets/theme-win95",
      value: {
        id: "theme-win95",
        type: "button",
        props: { label: "Win95", className: "theme-btn" },
        behavior: "local",
      },
    },
    {
      op: "add" as const,
      path: "/widgets/settings-system",
      value: {
        id: "settings-system",
        type: "box",
        props: { className: "settings-panel tab-panel-system hidden-tab-panel" },
        children: ["budget-table", "prefetch-toggle"],
      },
    },
    {
      op: "add" as const,
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
      op: "add" as const,
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
      op: "add" as const,
      path: "/widgets/desktop/children/-",
      value: rootId,
    },
    {
      op: "replace" as const,
      path: "/focus",
      value: { windowId: winId, widgetId: "dock-settings" },
    },
    {
      op: "add" as const,
      path: "/apps/settings",
      value: { open: true, activeTab: "general" },
    },
    {
      op: "add" as const,
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
