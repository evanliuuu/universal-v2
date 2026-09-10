import {
  decideDelta,
  decideSnapshot,
} from "./conflict";

export type SessionDocument = {
  state: unknown;
  ui: unknown;
};

export type RoomEvent = {
  sessionId: string;
  seq: number;
  event: unknown;
  tier: string;
  patches: unknown;
  latencyMs?: number;
  at: string;
};

export type RoomReject = {
  ok: false;
  reason: "stale" | "gap" | "unauthorized" | "bad-request";
  serverSeq: number;
  snapshot?: SessionDocument | null;
};

export type RoomAccept = {
  ok: true;
  serverSeq: number;
};

function newToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `tok_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/** Authoritative in-memory session room (Durable Object / local server). */
export class SessionRoom {
  readonly id: string;
  readonly token: string;
  /** When true, writes require the room token (shared / cloud sessions). */
  locked: boolean;
  seq = 0;
  document: SessionDocument | null = null;
  events: RoomEvent[] = [];
  createdAt: string;
  updatedAt: string;

  constructor(id: string, token = newToken(), locked = false) {
    this.id = id;
    this.token = token;
    this.locked = locked;
    const now = new Date().toISOString();
    this.createdAt = now;
    this.updatedAt = now;
  }

  authorize(token: string | undefined | null): boolean {
    if (!this.locked) return true;
    return Boolean(token) && token === this.token;
  }

  summary() {
    return {
      id: this.id,
      seq: this.seq,
      updatedAt: this.updatedAt,
      createdAt: this.createdAt,
      hasDocument: this.document != null,
    };
  }

  applySnapshot(
    token: string | undefined | null,
    seq: number,
    document: SessionDocument,
  ): RoomAccept | RoomReject {
    if (!this.authorize(token)) {
      return {
        ok: false,
        reason: "unauthorized",
        serverSeq: this.seq,
        snapshot: this.document,
      };
    }
    if (!Number.isFinite(seq) || seq < 0 || !document?.state || !document?.ui) {
      return {
        ok: false,
        reason: "bad-request",
        serverSeq: this.seq,
        snapshot: this.document,
      };
    }
    const decision = decideSnapshot(seq, this.seq);
    if (!decision.accept) {
      return {
        ok: false,
        reason: decision.reason,
        serverSeq: this.seq,
        snapshot: this.document,
      };
    }
    this.document = document;
    this.seq = seq;
    this.updatedAt = new Date().toISOString();
    return { ok: true, serverSeq: this.seq };
  }

  applyDelta(
    token: string | undefined | null,
    seq: number,
  ): RoomAccept | RoomReject {
    if (!this.authorize(token)) {
      return {
        ok: false,
        reason: "unauthorized",
        serverSeq: this.seq,
        snapshot: this.document,
      };
    }
    if (!Number.isFinite(seq) || seq < 0) {
      return {
        ok: false,
        reason: "bad-request",
        serverSeq: this.seq,
        snapshot: this.document,
      };
    }
    const decision = decideDelta(seq, this.seq);
    if (!decision.accept) {
      return {
        ok: false,
        reason: decision.reason,
        serverSeq: this.seq,
        snapshot: this.document,
      };
    }
    this.seq = seq;
    this.updatedAt = new Date().toISOString();
    return { ok: true, serverSeq: this.seq };
  }

  appendEvent(
    token: string | undefined | null,
    record: RoomEvent,
  ): RoomAccept | RoomReject {
    if (!this.authorize(token)) {
      return {
        ok: false,
        reason: "unauthorized",
        serverSeq: this.seq,
        snapshot: this.document,
      };
    }
    this.events.push(record);
    if (this.events.length > 2000) this.events.splice(0, this.events.length - 2000);
    this.updatedAt = new Date().toISOString();
    return { ok: true, serverSeq: this.seq };
  }

  toJSON() {
    return {
      id: this.id,
      token: this.token,
      locked: this.locked,
      seq: this.seq,
      document: this.document,
      events: this.events,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  static fromJSON(data: ReturnType<SessionRoom["toJSON"]>): SessionRoom {
    const room = new SessionRoom(data.id, data.token, data.locked ?? true);
    room.seq = data.seq;
    room.document = data.document;
    room.events = data.events ?? [];
    room.createdAt = data.createdAt;
    room.updatedAt = data.updatedAt;
    return room;
  }
}
