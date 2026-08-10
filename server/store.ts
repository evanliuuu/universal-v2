import { eq } from "drizzle-orm";
import { db } from "./db.js";
import { events, sessions } from "./schema.js";

export type StoredEvent = {
  sessionId: string;
  seq: number;
  event: unknown;
  tier: string;
  patches: unknown;
  latencyMs?: number;
  at: string;
};

export async function saveSessionSnapshot(opts: {
  id: string;
  document: unknown;
  seq: number;
}) {
  const now = new Date().toISOString();
  const existing = db.select().from(sessions).where(eq(sessions.id, opts.id)).get();
  const row = {
    id: opts.id,
    documentJson: JSON.stringify(opts.document),
    seq: opts.seq,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  db.insert(sessions).values(row).onConflictDoUpdate({
    target: sessions.id,
    set: {
      documentJson: row.documentJson,
      seq: row.seq,
      updatedAt: row.updatedAt,
    },
  }).run();
}

export async function appendServerEvent(record: StoredEvent) {
  db.insert(events).values({
    sessionId: record.sessionId,
    seq: record.seq,
    payloadJson: JSON.stringify(record),
    createdAt: record.at,
  }).run();
}

export async function getSessionEvents(sessionId: string): Promise<StoredEvent[]> {
  const rows = db
    .select()
    .from(events)
    .where(eq(events.sessionId, sessionId))
    .all();
  return rows
    .map((r) => JSON.parse(r.payloadJson) as StoredEvent)
    .sort((a, b) => a.seq - b.seq);
}

export async function getLatestSession() {
  const rows = db.select().from(sessions).all();
  rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    seq: row.seq,
    document: JSON.parse(row.documentJson),
    updatedAt: row.updatedAt,
  };
}
