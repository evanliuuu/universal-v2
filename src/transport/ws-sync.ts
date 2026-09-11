import type { PersistedEventRecord } from "../persistence/event-log";
import {
  encodeEvent,
  encodePrefetchHit,
  encodeRunFinished,
  encodeStateDelta,
  encodeStateSnapshot,
  encodeUiDelta,
} from "../protocol/ag-ui";
import { JsonPatchOp } from "../protocol/types";
import type { UniversalDocument } from "../state/patch";

export type SyncInboundMessage = {
  type: string;
  sessionId?: string;
  seq?: number;
  serverSeq?: number;
  reason?: string;
  state?: unknown;
  ui?: unknown;
  patch?: JsonPatchOp[];
  snapshot?: { state: unknown; ui: unknown } | null;
  authorized?: boolean;
  edge?: boolean;
  [key: string]: unknown;
};

export type SyncMessageHandler = (msg: SyncInboundMessage) => void;

export class WsSync {
  private socket: WebSocket | null = null;
  private url: string;
  private token: string | null = null;
  private sessionId: string | null = null;
  private onMessage: SyncMessageHandler | null = null;
  connected = false;
  edge = false;

  constructor(url: string) {
    this.url = url;
  }

  setHandler(handler: SyncMessageHandler | null) {
    this.onMessage = handler;
  }

  connect(opts?: { sessionId?: string; token?: string }): Promise<void> {
    this.sessionId = opts?.sessionId ?? this.sessionId;
    this.token = opts?.token ?? this.token;

    const target = new URL(this.url, window.location.href);
    if (this.sessionId) target.searchParams.set("sessionId", this.sessionId);
    if (this.token) target.searchParams.set("token", this.token);

    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(target.toString());
      this.socket.onopen = () => {
        this.connected = true;
        if (this.sessionId && this.token) {
          this.join(this.sessionId, this.token);
        }
        resolve();
      };
      this.socket.onerror = () =>
        reject(new Error(`WebSocket failed: ${target.toString()}`));
      this.socket.onclose = () => {
        this.connected = false;
      };
      this.socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data)) as SyncInboundMessage;
          if (msg.type === "CONNECTED" && msg.edge) this.edge = true;
          this.onMessage?.(msg);
        } catch {
          // ignore malformed
        }
      };
    });
  }

  join(sessionId: string, token: string) {
    this.sessionId = sessionId;
    this.token = token;
    this.send({ type: "JOIN", sessionId, token });
  }

  pushSnapshot(sessionId: string, seq: number, document: UniversalDocument) {
    this.send(encodeStateSnapshot(sessionId, seq, document));
  }

  pushStateDelta(sessionId: string, seq: number, patch: JsonPatchOp[]) {
    if (!patch.length) return;
    this.send(encodeStateDelta(sessionId, seq, patch));
  }

  pushUiDelta(sessionId: string, seq: number, patch: JsonPatchOp[]) {
    if (!patch.length) return;
    this.send(encodeUiDelta(sessionId, seq, patch));
  }

  pushEvent(sessionId: string, record: PersistedEventRecord) {
    this.send(
      encodeEvent(sessionId, {
        ...record,
        sessionId,
      }),
    );
  }

  pushPrefetchHit(sessionId: string, key: string, latencyMs: number) {
    this.send(encodePrefetchHit(sessionId, key, latencyMs));
  }

  pushRunFinished(
    sessionId: string,
    seq: number,
    tier: string,
    latencyMs: number,
  ) {
    this.send(encodeRunFinished(sessionId, seq, tier, latencyMs));
  }

  private send(payload: object) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
    }
  }
}

export function createWsSync(): WsSync | null {
  const url = import.meta.env.VITE_WS_URL as string | undefined;
  if (!url) return null;
  return new WsSync(url);
}

/** Create a cloud/local shared session via HTTP POST /sessions. */
export async function createRemoteSession(
  apiBase: string,
): Promise<{ sessionId: string; token: string; seq: number }> {
  const res = await fetch(new URL("/sessions", apiBase), { method: "POST" });
  if (!res.ok) throw new Error(`create session failed: ${res.status}`);
  return (await res.json()) as {
    sessionId: string;
    token: string;
    seq: number;
  };
}
