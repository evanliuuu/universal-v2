/**
 * Live smoke: two WebSocket clients sync through the session API
 * (Cloudflare Worker / wrangler DO — not the local Node SQLite server).
 *
 * Usage: npx tsx scripts/smoke-sync.ts [apiBase]
 * Default apiBase: http://127.0.0.1:8787
 */
import WebSocket from "ws";

const apiBase = (process.argv[2] ?? "http://127.0.0.1:8787").replace(/\/$/, "");

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function ok(msg: string) {
  console.log(`OK: ${msg}`);
}

async function connect(url: string): Promise<{
  ws: WebSocket;
  waitFor: (
    pred: (msg: Record<string, unknown>) => boolean,
    label: string,
    ms?: number,
  ) => Promise<Record<string, unknown>>;
}> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const buffer: Array<Record<string, unknown>> = [];
    const waiters: Array<{
      pred: (msg: Record<string, unknown>) => boolean;
      label: string;
      resolve: (msg: Record<string, unknown>) => void;
      reject: (err: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }> = [];

    const waitFor = (
      pred: (msg: Record<string, unknown>) => boolean,
      label: string,
      ms = 5000,
    ) =>
      new Promise<Record<string, unknown>>((res, rej) => {
        const existing = buffer.find(pred);
        if (existing) {
          res(existing);
          return;
        }
        const timer = setTimeout(() => {
          const idx = waiters.findIndex((w) => w.timer === timer);
          if (idx >= 0) waiters.splice(idx, 1);
          rej(new Error(`timeout waiting for ${label}`));
        }, ms);
        waiters.push({ pred, label, resolve: res, reject: rej, timer });
      });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as Record<string, unknown>;
        buffer.push(msg);
        for (let i = waiters.length - 1; i >= 0; i--) {
          const w = waiters[i];
          if (w.pred(msg)) {
            clearTimeout(w.timer);
            waiters.splice(i, 1);
            w.resolve(msg);
          }
        }
      } catch {
        // ignore
      }
    });
    ws.once("open", () => resolve({ ws, waitFor }));
    ws.once("error", reject);
  });
}

async function main() {
  console.log(`smoke-sync against ${apiBase}`);

  const health = await fetch(`${apiBase}/health`);
  if (!health.ok) fail(`health ${health.status}`);
  const healthBody = (await health.json()) as { service?: string; edge?: boolean };
  ok(`health service=${healthBody.service ?? "?"} edge=${Boolean(healthBody.edge)}`);

  if (!String(healthBody.service ?? "").includes("cloud") && !healthBody.edge) {
    fail(
      "/health is not the Cloudflare worker — refuse to claim Phase 8 proven against local Node",
    );
  }

  const created = await fetch(`${apiBase}/sessions`, { method: "POST" });
  if (!created.ok) fail(`POST /sessions ${created.status}`);
  const session = (await created.json()) as {
    sessionId: string;
    token: string;
    seq: number;
  };
  ok(`created session ${session.sessionId.slice(0, 8)}…`);

  const wsUrl =
    apiBase.replace(/^http/, "ws") +
    `/ws?sessionId=${encodeURIComponent(session.sessionId)}&token=${encodeURIComponent(session.token)}`;

  const a = await connect(wsUrl);
  const b = await connect(wsUrl);
  ok("two websockets connected");

  await a.waitFor((m) => m.type === "CONNECTED", "A CONNECTED");
  await b.waitFor((m) => m.type === "CONNECTED", "B CONNECTED");
  ok("both received CONNECTED");

  const snapshotDoc = {
    state: {
      meta: { theme: "dark", themeVars: {}, locale: "en", version: 2 },
      desktop: { rootId: "screen", dock: [] },
      windows: {},
      widgets: {
        screen: { id: "screen", type: "box", props: {}, children: [] },
      },
      focus: {},
      apps: {},
      handlers: {},
    },
    ui: {
      rootId: "screen",
      widgets: {
        screen: { id: "screen", type: "box", props: {}, children: [] },
      },
    },
  };

  const bGotSnap = b.waitFor(
    (m) => m.type === "STATE_SNAPSHOT" && m.seq === 1,
    "B STATE_SNAPSHOT",
  );
  a.ws.send(
    JSON.stringify({
      type: "STATE_SNAPSHOT",
      sessionId: session.sessionId,
      seq: 1,
      state: snapshotDoc.state,
      ui: snapshotDoc.ui,
    }),
  );
  const snapMsg = await bGotSnap;
  if ((snapMsg.state as { meta?: { theme?: string } })?.meta?.theme !== "dark") {
    fail("B snapshot theme was not dark");
  }
  ok("B received A's snapshot (theme=dark)");

  const bGotDelta = b.waitFor(
    (m) => m.type === "STATE_DELTA" && m.seq === 2,
    "B STATE_DELTA",
  );
  a.ws.send(
    JSON.stringify({
      type: "STATE_DELTA",
      sessionId: session.sessionId,
      seq: 2,
      patch: [{ op: "replace", path: "/meta/theme", value: "win95" }],
    }),
  );
  const deltaMsg = await bGotDelta;
  const patch = deltaMsg.patch as Array<{ value?: string }>;
  if (patch?.[0]?.value !== "win95") fail("B delta patch mismatch");
  ok("B received A's delta (theme→win95)");

  const rejected = a.waitFor((m) => m.type === "REJECTED", "A REJECTED");
  a.ws.send(
    JSON.stringify({
      type: "STATE_DELTA",
      sessionId: session.sessionId,
      seq: 2,
      patch: [{ op: "replace", path: "/meta/theme", value: "stale" }],
    }),
  );
  const rej = await rejected;
  if (rej.reason !== "stale") fail(`expected stale reject, got ${rej.reason}`);
  ok("stale delta rejected");

  a.ws.close();
  b.ws.close();
  console.log("\nPASS: two clients synced via Cloudflare session DO (no local Node server).");
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});
