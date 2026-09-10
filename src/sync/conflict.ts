/** Seq-ordered conflict policy for multi-tab / multi-client sync. */

export type ConflictDecision =
  | { accept: true; reason: "next" | "snapshot-catchup" }
  | { accept: false; reason: "stale" | "gap" };

/** Deltas must be exactly serverSeq + 1. */
export function decideDelta(clientSeq: number, serverSeq: number): ConflictDecision {
  if (clientSeq === serverSeq + 1) {
    return { accept: true, reason: "next" };
  }
  if (clientSeq <= serverSeq) {
    return { accept: false, reason: "stale" };
  }
  return { accept: false, reason: "gap" };
}

/** Snapshots win when seq is equal or newer (last-write-wins by seq). */
export function decideSnapshot(
  clientSeq: number,
  serverSeq: number,
): ConflictDecision {
  if (clientSeq >= serverSeq) {
    return { accept: true, reason: "snapshot-catchup" };
  }
  return { accept: false, reason: "stale" };
}

/** Remote apply on a client: only take the next seq, or a newer snapshot. */
export function decideRemoteApply(
  remoteSeq: number,
  localSeq: number,
  kind: "delta" | "snapshot",
): ConflictDecision {
  if (kind === "snapshot") return decideSnapshot(remoteSeq, localSeq);
  return decideDelta(remoteSeq, localSeq);
}
