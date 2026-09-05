import {
  encodeDispatch,
  encodeStateSnapshot,
  parseAgUiMessage,
} from "../src/protocol/messages";
import { createDocument } from "../src/state/patch";
import { createSeedState } from "../src/state/seed";

type Case = { name: string; ok: boolean; detail?: string };

export function runAgUiProtocolEval(): boolean {
  const cases: Case[] = [];
  const doc = createDocument(createSeedState());

  const snapshot = encodeStateSnapshot("sess-1", 4, doc);
  const parsedSnap = parseAgUiMessage(snapshot);
  cases.push({
    name: "STATE_SNAPSHOT uses state/ui (not document)",
    ok:
      parsedSnap?.type === "STATE_SNAPSHOT" &&
      parsedSnap.sessionId === "sess-1" &&
      parsedSnap.seq === 4 &&
      parsedSnap.state === doc.state &&
      parsedSnap.ui === doc.ui &&
      !("document" in snapshot),
  });

  cases.push({
    name: "reject legacy STATE_SNAPSHOT { document }",
    ok:
      parseAgUiMessage({
        type: "STATE_SNAPSHOT",
        sessionId: "sess-1",
        seq: 1,
        document: doc,
      }) === null,
  });

  cases.push({
    name: "reject legacy EVENT { record }",
    ok:
      parseAgUiMessage({
        type: "EVENT",
        record: { sessionId: "sess-1", event: { type: "click" } },
      }) === null,
  });

  const wire = encodeDispatch({
    sessionId: "sess-1",
    seq: 7,
    event: { type: "click", targetId: "dock-notes" },
    patches: [
      {
        target: "state",
        ops: [
          {
            op: "replace",
            path: "/focus",
            value: { windowId: "win-notes", widgetId: "dock-notes" },
          },
        ],
      },
      {
        target: "ui",
        ops: [{ op: "replace", path: "/rootId", value: "desktop" }],
      },
    ],
    tier: "compiled",
    latencyMs: 11.5,
    prefetchHit: true,
  });

  const types = wire.map((m) => m.type);
  cases.push({
    name: "dispatch emits EVENT, STATE_DELTA, UI_DELTA, PREFETCH_HIT, RUN_FINISHED",
    ok:
      JSON.stringify(types) ===
      JSON.stringify([
        "EVENT",
        "STATE_DELTA",
        "UI_DELTA",
        "PREFETCH_HIT",
        "RUN_FINISHED",
      ]),
    detail: types.join(","),
  });

  cases.push({
    name: "every dispatch frame parses as AgUiMessage",
    ok: wire.every((msg) => parseAgUiMessage(msg) !== null),
  });

  const finished = wire.find((m) => m.type === "RUN_FINISHED");
  cases.push({
    name: "RUN_FINISHED carries seq, tier, latency",
    ok:
      finished?.type === "RUN_FINISHED" &&
      finished.seq === 7 &&
      finished.tier === "compiled" &&
      finished.latencyMs === 11.5,
  });

  console.log("\n▶ ag-ui wire protocol");
  let passed = 0;
  for (const c of cases) {
    const mark = c.ok ? "✓" : "✗";
    console.log(`  ${mark} ${c.name}`);
    if (!c.ok && c.detail) console.log(`      ${c.detail}`);
    if (c.ok) passed++;
  }
  console.log(`  ${passed}/${cases.length} passed`);
  return passed === cases.length;
}
