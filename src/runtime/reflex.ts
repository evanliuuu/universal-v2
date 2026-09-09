import { JsonPatchOp, SemanticEvent } from "../protocol/types";
import { UniversalDocument } from "../state/patch";
import { getBudget } from "../agent/budget";
import { filesContents } from "../apps/files";

export type ReflexResult = {
  handled: boolean;
  statePatch: JsonPatchOp[];
  uiPatch: JsonPatchOp[];
};

/** Local reducers — reflex tier, no model call. */
export function tryReflex(
  doc: UniversalDocument,
  event: SemanticEvent,
): ReflexResult {
  const empty: ReflexResult = { handled: false, statePatch: [], uiPatch: [] };

  if (event.type === "close_window" && event.value) {
    const winId = String(event.value);
    const win = doc.state.windows[winId];
    if (!win) return empty;
    return {
      handled: true,
      statePatch: [
        { op: "remove", path: `/windows/${winId}` },
        { op: "replace", path: `/widgets/desktop/children`, value: (doc.state.widgets.desktop.children ?? []).filter((id) => id !== win.rootId) },
        { op: "remove", path: `/widgets/${win.rootId}` },
      ],
      uiPatch: [],
    };
  }

  if (event.type === "resize_window" && event.value) {
    const payload = event.value as {
      windowId?: string;
      width?: number;
      height?: number;
    };
    const winId = String(payload.windowId ?? "");
    const width = Number(payload.width);
    const height = Number(payload.height);
    if (!winId || !doc.state.windows[winId]) return empty;
    if (!Number.isFinite(width) || !Number.isFinite(height)) return empty;
    return {
      handled: true,
      statePatch: [
        {
          op: "replace",
          path: `/windows/${winId}/width`,
          value: Math.max(280, Math.round(width)),
        },
        {
          op: "replace",
          path: `/windows/${winId}/height`,
          value: Math.max(180, Math.round(height)),
        },
      ],
      uiPatch: [],
    };
  }

  if (event.type !== "click" && event.type !== "input") return empty;

  const targetId = event.targetId;
  if (!targetId) return empty;

  // Tab buttons are rendered by the tabs widget with synthetic ids (tab-*),
  // not stored as standalone widget nodes.
  if (event.type === "click" && targetId.startsWith("tab-")) {
    const tab = targetId.replace("tab-", "");
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
        { op: "replace", path: "/widgets/settings-general/props/className", value: generalClass },
        { op: "replace", path: "/widgets/settings-system/props/className", value: systemClass },
      ],
      uiPatch: [
        { op: "replace", path: "/widgets/settings-tabs/props/activeTab", value: tab },
        { op: "replace", path: "/widgets/settings-general/props/className", value: generalClass },
        { op: "replace", path: "/widgets/settings-system/props/className", value: systemClass },
      ],
    };
  }

  const widget = doc.state.widgets[targetId];
  if (!widget) return empty;

  const behavior = widget.behavior ?? (event.type === "input" ? "local" : "agent");
  if (behavior !== "local") return empty;

  if (event.type === "input") {
    if (targetId === "prefetch-toggle") {
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

    if (targetId === "theme-select" && typeof event.value === "string") {
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

    if (targetId === "ui-scale-slider") {
      const scale = Number(event.value);
      if (!Number.isFinite(scale)) return empty;
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

    if (typeof event.value === "string") {
      return {
        handled: true,
        statePatch: [
          {
            op: "replace",
            path: `/widgets/${targetId}/props/value`,
            value: event.value,
          },
        ],
        uiPatch: [
          {
            op: "replace",
            path: `/widgets/${targetId}/props/value`,
            value: event.value,
          },
        ],
      };
    }
  }

  if (event.type === "click" && targetId === "day-15") {
    const selected = (widget.props.className as string)?.includes("selected");
    const nextClass = selected ? "day-cell" : "day-cell selected";
    return {
      handled: true,
      statePatch: [
        { op: "replace", path: `/widgets/${targetId}/props/className`, value: nextClass },
        { op: "replace", path: "/apps/calendar/selectedDate", value: selected ? null : "2026-08-15" },
      ],
      uiPatch: [
        { op: "replace", path: `/widgets/${targetId}/props/className`, value: nextClass },
      ],
    };
  }

  if (event.type === "click" && (targetId === "cal-prev" || targetId === "cal-next")) {
    const label = doc.state.widgets["cal-label"];
    const text = String(label?.props.text ?? "August 2026");
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const match = text.match(/^(\w+)\s+(\d{4})$/);
    let month = 7;
    let year = 2026;
    if (match) {
      month = months.indexOf(match[1]);
      year = Number(match[2]);
    }
    if (targetId === "cal-prev") month -= 1;
    else month += 1;
    if (month < 0) { month = 11; year -= 1; }
    if (month > 11) { month = 0; year += 1; }
    const next = `${months[month]} ${year}`;
    return {
      handled: true,
      statePatch: [
        { op: "replace", path: "/widgets/cal-label/props/text", value: next },
        { op: "replace", path: "/apps/calendar/view", value: "month" },
      ],
      uiPatch: [
        { op: "replace", path: "/widgets/cal-label/props/text", value: next },
      ],
    };
  }

  if (
    event.type === "click" &&
    targetId?.startsWith("theme-") &&
    targetId !== "theme-select" &&
    targetId !== "theme-label"
  ) {
    const theme = targetId.replace("theme-", "");
    const patches: JsonPatchOp[] = [
      { op: "replace", path: "/meta/theme", value: theme },
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

  if (event.type === "click" && targetId === "files-list" && typeof event.value === "string") {
    const body = filesContents()[event.value];
    if (!body) return empty;
    return {
      handled: true,
      statePatch: [
        { op: "replace", path: "/widgets/files-list/props/selectedId", value: event.value },
        { op: "replace", path: "/widgets/files-preview/props/text", value: body },
        { op: "replace", path: "/apps/files/selected", value: event.value },
      ],
      uiPatch: [
        { op: "replace", path: "/widgets/files-list/props/selectedId", value: event.value },
        { op: "replace", path: "/widgets/files-preview/props/text", value: body },
      ],
    };
  }

  if (event.type === "click" && targetId === "settings-actions-menu") {
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
    targetId === "about-dialog" &&
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

  return empty;
}
