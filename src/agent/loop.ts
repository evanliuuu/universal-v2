import {
  AgentResponse,
  SemanticEvent,
  UniversalState,
} from "../protocol/types";
import {
  calendarWindowPatches,
  notesWindowPatches,
} from "../state/seed";

export type AgentMode = "mock" | "openrouter";

export async function runAgent(opts: {
  mode: AgentMode;
  state: UniversalState;
  event: SemanticEvent;
}): Promise<AgentResponse> {
  if (opts.mode === "openrouter") {
    return callOpenRouter(opts.state, opts.event);
  }
  return mockAgent(opts.state, opts.event);
}

function mockAgent(state: UniversalState, event: SemanticEvent): AgentResponse {
  if (event.type === "click" && event.targetId === "dock-calendar") {
    if (state.windows["win-calendar"]) {
      return {
        statePatch: [{ op: "replace", path: "/focus", value: { windowId: "win-calendar" } }],
        uiPatch: [],
        rationale: "Calendar already open; focus it.",
      };
    }
    return { ...calendarWindowPatches(), rationale: "Open calendar app." };
  }

  if (event.type === "click" && event.targetId === "dock-notes") {
    if (state.windows["win-notes"]) {
      return {
        statePatch: [{ op: "replace", path: "/focus", value: { windowId: "win-notes" } }],
        uiPatch: [],
        rationale: "Notes already open; focus it.",
      };
    }
    return { ...notesWindowPatches(), rationale: "Open notes app." };
  }

  if (event.type === "instruction" && typeof event.value === "string") {
    const text = event.value.toLowerCase();
    if (text.includes("calendar")) return { ...calendarWindowPatches(), rationale: event.value };
    if (text.includes("note")) return { ...notesWindowPatches(), rationale: event.value };
  }

  return {
    statePatch: [],
    uiPatch: [],
    rationale: `No mock handler for ${event.type} ${event.targetId ?? ""}`,
  };
}

async function callOpenRouter(
  state: UniversalState,
  event: SemanticEvent,
): Promise<AgentResponse> {
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined;
  if (!apiKey) {
    throw new Error("Set VITE_OPENROUTER_API_KEY in .env for OpenRouter mode");
  }

  const system = `You are the universal program runtime. Given current app state and a user event, respond with JSON only:
{ "statePatch": [...RFC6902 ops on state...], "uiPatch": [...ops on ui.widgets...], "rationale": "..." }
Rules:
- Emit deltas (JSON Patch), never full HTML.
- Widget types: box, text, button, input, window.
- Use /widgets/* paths for UI nodes; /windows/* for window chrome.
- Prefer minimal patches.`;

  const user = JSON.stringify({ state, event }, null, 2);

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:5174",
      "X-Title": "universal-v2",
    },
    body: JSON.stringify({
      model: "anthropic/claude-sonnet-4",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${err}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  const parsed = JSON.parse(content);
  return {
    statePatch: parsed.statePatch ?? [],
    uiPatch: parsed.uiPatch ?? [],
    rationale: parsed.rationale,
  };
}
