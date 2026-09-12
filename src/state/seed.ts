import { listApps } from "../apps";
import { UniversalState, WidgetNode } from "../protocol/types";

function w(node: WidgetNode): WidgetNode {
  return node;
}

function dockWidgets(): Record<string, WidgetNode> {
  const widgets: Record<string, WidgetNode> = {};
  for (const app of listApps()) {
    widgets[app.dockId] = w({
      id: app.dockId,
      type: "button",
      props: {
        label: app.dockLabel,
        title: app.dockTitle ?? app.title,
        className: "dock-icon",
      },
      behavior: "agent",
    });
  }
  return widgets;
}

/** Seed desktop: menubar + dock icons from registered apps. */
export function createSeedState(): UniversalState {
  const apps = listApps();
  const dockIds = apps.map((app) => app.dockId);
  const widgets: Record<string, WidgetNode> = {
    screen: w({
      id: "screen",
      type: "box",
      props: { className: "screen", role: "application", ariaLabel: "Universal desktop" },
      children: ["menubar", "desktop", "dock"],
    }),
    menubar: w({
      id: "menubar",
      type: "box",
      props: { className: "menubar", role: "banner", ariaLabel: "Menu bar" },
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
      props: { className: "desktop", role: "main", ariaLabel: "Desktop" },
      children: [],
    }),
    dock: w({
      id: "dock",
      type: "box",
      props: { className: "dock", role: "toolbar", ariaLabel: "Applications" },
      children: dockIds,
    }),
    ...dockWidgets(),
  };

  return {
    meta: {
      theme: "cupertino",
      themeVars: {},
      locale: "en",
      version: 2,
      budget: {
        tokensUsed: 0,
        tokenLimit: 50_000,
        prefetchEnabled: true,
        maxPrefetchPending: 4,
      },
    },
    desktop: { rootId: "screen", dock: dockIds },
    windows: {},
    widgets,
    focus: {},
    apps: {},
    handlers: {},
  };
}
