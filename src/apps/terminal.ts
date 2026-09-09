import { JsonPatchOp } from "../protocol/types";
import { defineApp } from "./registry";

function terminalWindowPatches(): {
  statePatch: JsonPatchOp[];
  uiPatch: JsonPatchOp[];
} {
  const winId = "win-terminal";
  const rootId = "terminal-root";
  const welcome = "Universal terminal\nType help, then Run.\n";
  const statePatch: JsonPatchOp[] = [
    {
      op: "add",
      path: `/windows/${winId}`,
      value: {
        id: winId,
        title: "Terminal",
        x: 240,
        y: 140,
        width: 520,
        height: 340,
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
        props: { title: "Terminal", windowId: winId },
        children: ["terminal-header", "terminal-scroll", "terminal-row"],
      },
    },
    {
      op: "add",
      path: "/widgets/terminal-header",
      value: {
        id: "terminal-header",
        type: "box",
        props: { layout: "flex", gap: 8, align: "center" },
        children: ["terminal-icon", "terminal-title"],
      },
    },
    {
      op: "add",
      path: "/widgets/terminal-icon",
      value: {
        id: "terminal-icon",
        type: "icon",
        props: { glyph: "💻", size: 22, title: "Terminal" },
      },
    },
    {
      op: "add",
      path: "/widgets/terminal-title",
      value: {
        id: "terminal-title",
        type: "text",
        props: { text: "Session" },
      },
    },
    {
      op: "add",
      path: "/widgets/terminal-scroll",
      value: {
        id: "terminal-scroll",
        type: "scroll-area",
        props: { maxHeight: 180, className: "terminal-scroll" },
        children: ["terminal-output"],
      },
    },
    {
      op: "add",
      path: "/widgets/terminal-output",
      value: {
        id: "terminal-output",
        type: "text",
        props: { text: welcome, className: "files-preview" },
      },
    },
    {
      op: "add",
      path: "/widgets/terminal-row",
      value: {
        id: "terminal-row",
        type: "box",
        props: { layout: "flex", gap: 8, align: "center" },
        children: ["terminal-input", "terminal-run"],
      },
    },
    {
      op: "add",
      path: "/widgets/terminal-input",
      value: {
        id: "terminal-input",
        type: "input",
        props: { value: "", placeholder: "command…" },
        behavior: "local",
      },
    },
    {
      op: "add",
      path: "/widgets/terminal-run",
      value: {
        id: "terminal-run",
        type: "button",
        props: { label: "Run", className: "toolbar-btn" },
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
      value: { windowId: winId, widgetId: "dock-terminal" },
    },
    {
      op: "add",
      path: "/apps/terminal",
      value: { open: true, history: welcome },
    },
    {
      op: "add",
      path: "/handlers/focus-terminal",
      value: {
        match: { type: "click", targetId: "dock-terminal" },
        when: "!!state.windows['win-terminal']",
        statePatch: [
          {
            op: "replace",
            path: "/focus",
            value: { windowId: winId, widgetId: "dock-terminal" },
          },
        ],
        uiPatch: [],
      },
    },
  ];
  const uiPatch = statePatch.filter((op) => op.path.startsWith("/widgets"));
  return { statePatch, uiPatch };
}

function runCommand(command: string, history: string): string {
  const trimmed = command.trim();
  const lower = trimmed.toLowerCase();
  let result = "";
  if (!trimmed) result = "";
  else if (lower === "help") result = "commands: help, clear, date, echo <text>";
  else if (lower === "clear") return "Universal terminal\n";
  else if (lower === "date") result = new Date().toISOString();
  else if (lower.startsWith("echo ")) result = trimmed.slice(5);
  else result = `unknown command: ${trimmed}`;
  return `${history}$ ${trimmed}\n${result}${result ? "\n" : ""}`;
}

defineApp({
  id: "terminal",
  title: "Terminal",
  dockId: "dock-terminal",
  windowId: "win-terminal",
  dockLabel: "💻",
  dockTitle: "Terminal",
  aliases: ["term", "shell"],
  open: () => terminalWindowPatches(),
  reflex: (doc, event) => {
    if (event.type === "click" && event.targetId === "terminal-run") {
      const input = doc.state.widgets["terminal-input"];
      const command = String(input?.props.value ?? "");
      const history = String(
        (doc.state.apps.terminal as { history?: string } | undefined)?.history ??
          String(doc.state.widgets["terminal-output"]?.props.text ?? ""),
      );
      const next = runCommand(command, history);
      return {
        handled: true,
        statePatch: [
          { op: "replace", path: "/widgets/terminal-output/props/text", value: next },
          { op: "replace", path: "/widgets/terminal-input/props/value", value: "" },
          { op: "replace", path: "/apps/terminal/history", value: next },
        ],
        uiPatch: [
          { op: "replace", path: "/widgets/terminal-output/props/text", value: next },
          { op: "replace", path: "/widgets/terminal-input/props/value", value: "" },
        ],
      };
    }
    return null;
  },
});
