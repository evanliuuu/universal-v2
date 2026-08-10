import type { PersistedEventRecord } from "../persistence/event-log";
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
    this.send({ type: "STATE_SNAPSHOT", sessionId, seq, document });
  }

  pushEvent(sessionId: string, record: PersistedEventRecord) {
    this.send({
      type: "EVENT",
      record: { sessionId, ...record },
    });
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
