import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { SessionRoom } from "../src/sync/session-room.js";
import {
  appendServerEvent,
  getLatestSession,
  getSessionEvents,
  listSessions,
  saveSessionSnapshot,
  StoredEvent,
} from "./store.js";

const PORT = Number(process.env.UNIVERSAL_SERVER_PORT ?? 8787);

/** In-memory rooms for seq conflict policy (SQLite still persists snapshots). */
const rooms = new Map<string, SessionRoom>();
const socketMeta = new WeakMap<WebSocket, { sessionId?: string; token?: string }>();

function getRoom(sessionId: string): SessionRoom {
  let room = rooms.get(sessionId);
  if (!room) {
    room = new SessionRoom(sessionId);
    rooms.set(sessionId, room);
  }
  return room;
}

const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, service: "universal-v2", port: PORT }));
      return;
    }

    if (url.pathname === "/sessions" && req.method === "POST") {
      const sessionId = crypto.randomUUID();
      const room = new SessionRoom(sessionId, undefined, true);
      rooms.set(sessionId, room);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          sessionId: room.id,
          token: room.token,
          seq: room.seq,
        }),
      );
      return;
    }

    if (url.pathname === "/sessions" && req.method === "GET") {
      const sessions = await listSessions();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ sessions }));
      return;
    }

    const sessionMatch = url.pathname.match(/^\/sessions\/([^/]+)$/);
    if (sessionMatch && req.method === "GET") {
      const sessionId = decodeURIComponent(sessionMatch[1]);
      const token = url.searchParams.get("token");
      const room = rooms.get(sessionId);
      if (!room || !room.authorize(token)) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          session: {
            ...room.summary(),
            document: room.document,
          },
        }),
      );
      return;
    }

    const eventsMatch = url.pathname.match(/^\/sessions\/([^/]+)\/events$/);
    if (eventsMatch && req.method === "GET") {
      const sessionId = decodeURIComponent(eventsMatch[1]);
      const token = url.searchParams.get("token");
      const room = rooms.get(sessionId);
      if (room && !room.authorize(token)) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
      const events = room?.events?.length
        ? room.events
        : await getSessionEvents(sessionId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ sessionId, events }));
      return;
    }

    if (url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          service: "universal-v2",
          routes: [
            "/health",
            "POST /sessions",
            "/sessions",
            "/sessions/:id",
            "/sessions/:id/events",
            "/ws",
          ],
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

wss.on("connection", (socket, req) => {
  const url = new URL(req.url ?? "/ws", `http://localhost:${PORT}`);
  const sessionId = url.searchParams.get("sessionId") ?? undefined;
  const token = url.searchParams.get("token") ?? undefined;
  socketMeta.set(socket, { sessionId, token });

  const room = sessionId ? getRoom(sessionId) : null;
  socket.send(
    JSON.stringify({
      type: "CONNECTED",
      port: PORT,
      sessionId: sessionId ?? null,
      seq: room?.seq ?? 0,
      authorized: room ? room.authorize(token) : false,
    }),
  );

  if (room?.authorize(token) && room.document) {
    socket.send(
      JSON.stringify({
        type: "STATE_SNAPSHOT",
        sessionId: room.id,
        seq: room.seq,
        state: room.document.state,
        ui: room.document.ui,
      }),
    );
  }

  socket.on("message", async (raw) => {
    try {
      const msg = JSON.parse(String(raw));
      const meta = socketMeta.get(socket) ?? {};

      if (msg.type === "JOIN") {
        meta.sessionId = String(msg.sessionId ?? meta.sessionId ?? "");
        meta.token = String(msg.token ?? meta.token ?? "");
        socketMeta.set(socket, meta);
        const joinRoom = getRoom(meta.sessionId);
        const ok = joinRoom.authorize(meta.token);
        socket.send(
          JSON.stringify({
            type: ok ? "JOIN_OK" : "REJECTED",
            reason: ok ? undefined : "unauthorized",
            sessionId: joinRoom.id,
            serverSeq: joinRoom.seq,
            snapshot: ok ? joinRoom.document : undefined,
          }),
        );
        return;
      }

      const activeId = String(msg.sessionId ?? meta.sessionId ?? "");
      if (!activeId) {
        socket.send(
          JSON.stringify({ type: "ERROR", message: "sessionId required" }),
        );
        return;
      }
      const room = getRoom(activeId);
      const token = meta.token;

      if (msg.type === "STATE_SNAPSHOT") {
        const document =
          msg.document ??
          (msg.state && msg.ui ? { state: msg.state, ui: msg.ui } : null);
        if (!document) {
          throw new Error("STATE_SNAPSHOT requires document or state+ui");
        }
        const result = room.applySnapshot(token, Number(msg.seq ?? 0), document);
        if (!result.ok) {
          socket.send(
            JSON.stringify({
              type: "REJECTED",
              reason: result.reason,
              serverSeq: result.serverSeq,
              snapshot: result.snapshot,
            }),
          );
          return;
        }
        await saveSessionSnapshot({
          id: room.id,
          document,
          seq: room.seq,
        });
        broadcast(
          {
            type: "STATE_SNAPSHOT",
            sessionId: room.id,
            seq: room.seq,
            state: document.state,
            ui: document.ui,
          },
          socket,
        );
        return;
      }

      if (msg.type === "STATE_DELTA" || msg.type === "UI_DELTA") {
        const result = room.applyDelta(token, Number(msg.seq ?? 0));
        if (!result.ok) {
          socket.send(
            JSON.stringify({
              type: "REJECTED",
              reason: result.reason,
              serverSeq: result.serverSeq,
              snapshot: result.snapshot,
            }),
          );
          return;
        }
        broadcast(msg, socket);
        return;
      }

      if (msg.type === "RUN_FINISHED") {
        broadcast(msg, socket);
        return;
      }

      if (msg.type === "EVENT") {
        const record = (msg.record ?? msg.event) as StoredEvent;
        if (msg.record) {
          room.appendEvent(token, record);
          await appendServerEvent(record);
        }
        broadcast({ type: "EVENT", sessionId: room.id, event: record }, socket);
        return;
      }

      if (msg.type === "GET_SESSION") {
        const latest = room.document
          ? {
              id: room.id,
              seq: room.seq,
              document: room.document,
              updatedAt: room.updatedAt,
            }
          : await getLatestSession();
        socket.send(JSON.stringify({ type: "SESSION", session: latest }));
        return;
      }

      if (msg.type === "GET_EVENTS") {
        const events =
          room.events.length > 0
            ? room.events
            : await getSessionEvents(msg.sessionId ?? room.id);
        socket.send(
          JSON.stringify({
            type: "EVENTS",
            sessionId: msg.sessionId ?? room.id,
            events,
          }),
        );
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

function broadcast(payload: object, except?: WebSocket) {
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
