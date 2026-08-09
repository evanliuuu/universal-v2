import { UniversalDocument } from "../state/patch";
import { EventLogEntry, SemanticEvent } from "../protocol/types";

export class RuntimeStore {
  private doc: UniversalDocument;
  private log: EventLogEntry[] = [];
  private nextId = 1;
  private listeners = new Set<() => void>();

  constructor(doc: UniversalDocument) {
    this.doc = doc;
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

  appendLog(entry: Omit<EventLogEntry, "id">) {
    this.log.unshift({ ...entry, id: this.nextId++ });
    if (this.log.length > 50) this.log.length = 50;
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
