import { UniversalDocument } from "../state/patch";
import {
  EventLogEntry,
  ExecutionTier,
  SemanticEvent,
} from "../protocol/types";

export class RuntimeStore {
  private doc: UniversalDocument;
  private log: EventLogEntry[] = [];
  private nextId = 1;
  private seq = 0;
  private sessionId: string;
  private listeners = new Set<() => void>();

  constructor(doc: UniversalDocument, sessionId?: string) {
    this.doc = doc;
    this.sessionId = sessionId ?? crypto.randomUUID();
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getSeq(): number {
    return this.seq;
  }

  setSeq(seq: number) {
    this.seq = seq;
  }

  nextSeq(): number {
    this.seq += 1;
    return this.seq;
  }

  getDocument(): UniversalDocument {
    return this.doc;
  }

  getState() {
    return this.doc.state;
  }

  getUi() {
    return this.doc.ui;
  }

  setDocument(doc: UniversalDocument) {
    this.doc = doc;
    this.emit();
  }

  newSession(doc: UniversalDocument, sessionId?: string) {
    this.sessionId = sessionId ?? crypto.randomUUID();
    this.seq = 0;
    this.log = [];
    this.nextId = 1;
    this.doc = doc;
    this.emit();
  }

  appendLog(entry: Omit<EventLogEntry, "id" | "seq">) {
    const seq = entry.seq ?? this.seq;
    this.log.unshift({ ...entry, id: this.nextId++, seq });
    if (this.log.length > 100) this.log.length = 100;
    this.emit();
  }

  getLog(): EventLogEntry[] {
    return this.log;
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }
}

export function createSemanticEvent(
  partial: Omit<SemanticEvent, "at"> & { at?: string },
): SemanticEvent {
  return { ...partial, at: partial.at ?? new Date().toISOString() };
}

export function tierLabel(tier: ExecutionTier, prefetchHit?: boolean): string {
  if (prefetchHit) return `${tier} (prefetch)`;
  return tier;
}
