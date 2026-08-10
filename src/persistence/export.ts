import { UniversalDocument } from "../state/patch";
import { PersistedEventRecord } from "./event-log";

export type SessionExport = {
  version: 2;
  exportedAt: string;
  sessionId: string;
  seq: number;
  document: UniversalDocument;
  events: PersistedEventRecord[];
};

export function buildSessionExport(opts: {
  sessionId: string;
  seq: number;
  document: UniversalDocument;
  events: PersistedEventRecord[];
}): SessionExport {
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    sessionId: opts.sessionId,
    seq: opts.seq,
    document: structuredClone(opts.document),
    events: structuredClone(opts.events),
  };
}

export function downloadSessionJson(exportData: SessionExport, filename?: string) {
  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename ?? `universal-session-${exportData.sessionId.slice(0, 8)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function parseSessionImport(file: File): Promise<SessionExport> {
  const text = await file.text();
  const data = JSON.parse(text) as SessionExport;
  if (data.version !== 2 || !data.document) {
    throw new Error("Invalid session export file");
  }
  return data;
}
