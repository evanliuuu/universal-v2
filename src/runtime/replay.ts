import {
  applyStatePatch,
  applyUiPatch,
  cloneDocument,
  createDocument,
  UniversalDocument,
} from "../state/patch";
import { createSeedState } from "../state/seed";
import { PersistedEventRecord, SessionPersistence } from "../persistence/event-log";

export type ReplayStep = {
  seq: number;
  tier: string;
  event: PersistedEventRecord["event"];
  doc: UniversalDocument;
};

/** Replay a session by re-applying persisted patches (no model calls). */
export async function replaySession(
  persistence: SessionPersistence,
  sessionId: string,
  onStep?: (step: ReplayStep) => void,
): Promise<UniversalDocument> {
  const events = await persistence.getEvents(sessionId);
  let doc = createDocument(createSeedState());

  for (const record of events) {
    for (const patch of record.patches) {
      if (patch.target === "state") {
        doc = applyStatePatch(doc, patch.ops);
      } else {
        doc = applyUiPatch(doc, patch.ops);
      }
    }
    onStep?.({
      seq: record.seq,
      tier: record.tier,
      event: record.event,
      doc: cloneDocument(doc),
    });
  }

  return doc;
}
