import { SessionRoom } from "../../src/sync/session-room";

export interface Env {
  SESSIONS: DurableObjectNamespace;
  UNIVERSAL_API_SECRET?: string;
}

type SocketMeta = { token: string };

/**
 * One Durable Object per session — authoritative seq, snapshot, event log,
 * and WebSocket fan-out for multiplayer.
 */
export class SessionDurableObject {
  private state: DurableObjectState;
  private room: SessionRoom | null = null;
  private sockets = new Map<WebSocket, SocketMeta>();

  constructor(state: DurableObjectState, _env: Env) {
    this.state = state;
  }

  private async loadRoom(sessionId: string): Promise<SessionRoom> {
    if (this.room) return this.room;
    const saved = await this.state.storage.get<ReturnType<SessionRoom["toJSON"]>>(
      "room",
    );
    this.room = saved
      ? SessionRoom.fromJSON(saved)
      : new SessionRoom(sessionId);
    return this.room;
  }

  private async persist() {
    if (!this.room) return;
    await this.state.storage.put("room", this.room.toJSON());
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/create" && request.method === "POST") {
      const body = (await request.json()) as { sessionId?: string };
      const sessionId = body.sessionId ?? crypto.randomUUID();
      this.room = new SessionRoom(sessionId, undefined, true);
      await this.persist();
      return Response.json({
        sessionId: this.room.id,
        token: this.room.token,
        seq: this.room.seq,
      });
    }

    if (url.pathname === "/session" && request.method === "GET") {
      const token = url.searchParams.get("token");
      const sessionId = url.searchParams.get("sessionId") ?? "session";
      const room = await this.loadRoom(sessionId);
      if (!room.authorize(token)) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }
      return Response.json({
        session: {
          ...room.summary(),
          document: room.document,
        },
      });
    }

    if (url.pathname === "/events" && request.method === "GET") {
      const token = url.searchParams.get("token");
      const sessionId = url.searchParams.get("sessionId") ?? "session";
      const room = await this.loadRoom(sessionId);
      if (!room.authorize(token)) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }
      return Response.json({ sessionId: room.id, events: room.events });
    }

    if (url.pathname === "/ws") {
      const token = url.searchParams.get("token") ?? "";
      const sessionId = url.searchParams.get("sessionId") ?? "session";
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      server.accept();
      this.sockets.set(server, { token });
      server.addEventListener("message", (event) => {
        void this.onMessage(server, String(event.data));
      });
      server.addEventListener("close", () => {
        this.sockets.delete(server);
      });
      const room = await this.loadRoom(sessionId);
      // Cloud rooms are always locked once created via POST; if this DO was
      // reached without create, lock it and require the room token.
      if (!room.locked) {
        room.locked = true;
        await this.persist();
      }
      server.send(
        JSON.stringify({
          type: "CONNECTED",
          sessionId: room.id,
          seq: room.seq,
          authorized: room.authorize(token),
          edge: true,
        }),
      );
      if (room.authorize(token) && room.document) {
        server.send(
          JSON.stringify({
            type: "STATE_SNAPSHOT",
            sessionId: room.id,
            seq: room.seq,
            state: room.document.state,
            ui: room.document.ui,
          }),
        );
      }
      return new Response(null, { status: 101, webSocket: client });
    }

    return Response.json({ error: "not found" }, { status: 404 });
  }

  private broadcast(payload: object, except?: WebSocket) {
    const data = JSON.stringify(payload);
    for (const [socket] of this.sockets) {
      if (socket === except) continue;
      try {
        socket.send(data);
      } catch {
        this.sockets.delete(socket);
      }
    }
  }

  private async onMessage(socket: WebSocket, raw: string) {
    const meta = this.sockets.get(socket);
    if (!meta) return;
    try {
      const msg = JSON.parse(raw) as Record<string, unknown>;
      const room = await this.loadRoom(String(msg.sessionId ?? "unknown"));

      if (msg.type === "JOIN") {
        const token = String(msg.token ?? meta.token);
        meta.token = token;
        this.sockets.set(socket, meta);
        const ok = room.authorize(token);
        socket.send(
          JSON.stringify({
            type: ok ? "JOIN_OK" : "REJECTED",
            reason: ok ? undefined : "unauthorized",
            sessionId: room.id,
            serverSeq: room.seq,
            snapshot: ok ? room.document : undefined,
          }),
        );
        return;
      }

      if (msg.type === "STATE_SNAPSHOT") {
        const document =
          (msg.document as { state: unknown; ui: unknown } | undefined) ??
          (msg.state && msg.ui
            ? { state: msg.state, ui: msg.ui }
            : null);
        if (!document) {
          socket.send(
            JSON.stringify({
              type: "REJECTED",
              reason: "bad-request",
              serverSeq: room.seq,
            }),
          );
          return;
        }
        const result = room.applySnapshot(
          meta.token,
          Number(msg.seq ?? 0),
          document,
        );
        await this.persist();
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
        this.broadcast(
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
        const result = room.applyDelta(meta.token, Number(msg.seq ?? 0));
        await this.persist();
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
        this.broadcast(msg, socket);
        return;
      }

      if (msg.type === "EVENT") {
        const record = (msg.record ?? msg.event) as {
          sessionId: string;
          seq: number;
          event: unknown;
          tier: string;
          patches: unknown;
          latencyMs?: number;
          at: string;
        };
        room.appendEvent(meta.token, {
          ...record,
          sessionId: room.id,
        });
        await this.persist();
        this.broadcast(
          { type: "EVENT", sessionId: room.id, event: record },
          socket,
        );
        return;
      }

      if (msg.type === "RUN_FINISHED" || msg.type === "PREFETCH_HIT") {
        this.broadcast(msg, socket);
        return;
      }

      if (msg.type === "GET_SESSION") {
        socket.send(
          JSON.stringify({
            type: "SESSION",
            session: room.document
              ? {
                  id: room.id,
                  seq: room.seq,
                  document: room.document,
                  updatedAt: room.updatedAt,
                }
              : null,
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
  }
}
