import { UniversalDocument } from "../state/patch";
import { EventLogEntry, SemanticEvent } from "../protocol/types";

const DB_NAME = "universal-v2";
const DB_VERSION = 1;

export type PersistedSession = {
  id: string;
  createdAt: string;
  updatedAt: string;
  seq: number;
  document: UniversalDocument;
};

export type PersistedEventRecord = {
  sessionId: string;
  seq: number;
  event: SemanticEvent;
  tier: string;
  modelTier?: string;
  prefetchHit?: boolean;
  patches: EventLogEntry["patches"];
  latencyMs?: number;
  at: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("sessions")) {
        db.createObjectStore("sessions", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("events")) {
        const store = db.createObjectStore("events", { keyPath: ["sessionId", "seq"] });
        store.createIndex("bySession", "sessionId", { unique: false });
      }
    };
  });
}

export class SessionPersistence {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    this.db = await openDb();
  }

  async loadLatestSession(): Promise<PersistedSession | null> {
    const db = this.requireDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("sessions", "readonly");
      const store = tx.objectStore("sessions");
      const req = store.getAll();
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const rows = (req.result as PersistedSession[]).sort(
          (a, b) => b.updatedAt.localeCompare(a.updatedAt),
        );
        resolve(rows[0] ?? null);
      };
    });
  }

  async saveSession(session: PersistedSession): Promise<void> {
    const db = this.requireDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("sessions", "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore("sessions").put(session);
    });
  }

  async appendEvent(record: PersistedEventRecord): Promise<void> {
    const db = this.requireDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("events", "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore("events").put(record);
    });
  }

  async getEvents(sessionId: string): Promise<PersistedEventRecord[]> {
    const db = this.requireDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("events", "readonly");
      const store = tx.objectStore("events");
      const idx = store.index("bySession");
      const req = idx.getAll(sessionId);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const rows = (req.result as PersistedEventRecord[]).sort((a, b) => a.seq - b.seq);
        resolve(rows);
      };
    });
  }

  async clearAll(): Promise<void> {
    const db = this.requireDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["sessions", "events"], "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore("sessions").clear();
      tx.objectStore("events").clear();
    });
  }

  private requireDb(): IDBDatabase {
    if (!this.db) throw new Error("SessionPersistence not initialized");
    return this.db;
  }
}

export const KEYFRAME_EVERY_N_EVENTS = 5;
