import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import {
  appendServerEvent,
  getLatestSession,
  getSessionEvents,
  saveSessionSnapshot,
  StoredEvent,
} from "./store.js";

const PORT = Number(process.env.UNIVERSAL_SERVER_PORT ?? 8787);

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, service: "universal-v2" }));
});

const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

wss.on("connection", (socket) => {
  socket.send(JSON.stringify({ type: "CONNECTED", port: PORT }));

  socket.on("message", async (raw) => {
    try {
      const msg = JSON.parse(String(raw));
      if (msg.type === "STATE_SNAPSHOT") {
        await saveSessionSnapshot({
          id: msg.sessionId,
          document: msg.document,
          seq: msg.seq ?? 0,
        });
        broadcast({ type: "STATE_SNAPSHOT", sessionId: msg.sessionId, seq: msg.seq }, socket);
        return;
      }
      if (msg.type === "EVENT") {
        const record = msg.record as StoredEvent;
        await appendServerEvent(record);
        broadcast({ type: "EVENT", record }, socket);
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
      }
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
