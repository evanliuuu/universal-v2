import type { PersistedEventRecord } from "../persistence/event-log";
import {
  encodeEvent,
  encodeRunFinished,
  encodeStateDelta,
  encodeStateSnapshot,
  encodeUiDelta,
} from "../protocol/ag-ui";
import { JsonPatchOp } from "../protocol/types";
import type { UniversalDocument } from "../state/patch";

export class WsSync {
  private socket: WebSocket | null = null;
  private url: string;
  connected = false;

  constructor(url: string) {
    this.url = url;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(this.url);
      this.socket.onopen = () => {
        this.connected = true;
        resolve();
      };
      this.socket.onerror = () => reject(new Error(`WebSocket failed: ${this.url}`));
      this.socket.onclose = () => {
        this.connected = false;
      };
    });
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
