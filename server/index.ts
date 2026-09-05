import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { AgUiMessage, parseAgUiMessage } from "../src/protocol/messages.js";
import {
  appendServerEvent,
  getLatestSession,
  getSessionEvents,
  listSessions,
  saveSessionSnapshot,
  StoredEvent,
} from "./store.js";

const PORT = Number(process.env.UNIVERSAL_SERVER_PORT ?? 8787);

const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  try {
    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, service: "universal-v2", port: PORT }));
      return;
    }

    if (url.pathname === "/sessions" && req.method === "GET") {
      const sessions = await listSessions();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ sessions }));
      return;
    }

    const eventsMatch = url.pathname.match(/^\/sessions\/([^/]+)\/events$/);
    if (eventsMatch && req.method === "GET") {
      const events = await getSessionEvents(eventsMatch[1]);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ sessionId: eventsMatch[1], events }));
      return;
    }

    if (url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          service: "universal-v2",
          routes: ["/health", "/sessions", "/sessions/:id/events", "/ws"],
        }),
      );
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  } catch (error) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
});

const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

wss.on("connection", (socket) => {
  socket.send(JSON.stringify({ type: "CONNECTED", port: PORT }));

  socket.on("message", async (raw) => {
    try {
      const msg = JSON.parse(String(raw));
      const agUi = parseAgUiMessage(msg);
      if (agUi) {
        await persistAgUiMessage(agUi);
        broadcast(agUi, socket);
        return;
      }
      if (msg.type === "GET_SESSION") {
        const latest = await getLatestSession();
        socket.send(JSON.stringify({ type: "SESSION", session: latest }));
        return;
      }
      if (msg.type === "GET_EVENTS") {
        const events = await getSessionEvents(msg.sessionId);
        socket.send(JSON.stringify({ type: "EVENTS", sessionId: msg.sessionId, events }));
        return;
      }
      socket.send(
        JSON.stringify({ type: "ERROR", message: "unknown or invalid message" }),
      );
    } catch (error) {
      socket.send(
        JSON.stringify({
          type: "ERROR",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  });
});

async function persistAgUiMessage(msg: AgUiMessage) {
  if (msg.type === "STATE_SNAPSHOT") {
    await saveSessionSnapshot({
      id: msg.sessionId,
      document: { state: msg.state, ui: msg.ui },
      seq: msg.seq,
    });
    return;
  }

  const record: StoredEvent = {
    sessionId: msg.sessionId,
    seq: "seq" in msg ? msg.seq : 0,
    event: msg.type === "EVENT" ? msg.event : msg,
    tier: msg.type === "RUN_FINISHED" ? msg.tier : msg.type,
    patches: "patch" in msg ? msg.patch : [],
    latencyMs: "latencyMs" in msg ? msg.latencyMs : undefined,
    at: new Date().toISOString(),
  };
  await appendServerEvent(record);
}

function broadcast(payload: object, except?: import("ws").WebSocket) {
  const data = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client !== except && client.readyState === 1) {
      client.send(data);
    }
  }
}

httpServer.listen(PORT, () => {
  console.log(`universal-v2 server listening on http://localhost:${PORT} (ws /ws)`);
});
