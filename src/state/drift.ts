import { WidgetNode } from "../protocol/types";

/** Stable fingerprint of the widget tree for drift detection. */
export function widgetTreeFingerprint(
  widgets: Record<string, WidgetNode>,
): string {
  const ids = Object.keys(widgets).sort();
  const parts = ids.map((id) => {
    const n = widgets[id];
    return `${id}:${n.type}:${JSON.stringify(n.props)}:${(n.children ?? []).join(",")}`;
  });
  return String(parts.join("|").length) + ":" + simpleHash(parts.join("|"));
}

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export type DriftResult = {
  drifted: boolean;
  reason?: string;
};

/** Detect if incremental patches may have left the DOM out of sync. */
export function detectDrift(
  prev: Record<string, WidgetNode> | null,
  next: Record<string, WidgetNode>,
  patchCount: number,
): DriftResult {
  if (!prev) return { drifted: false };

  const prevFp = widgetTreeFingerprint(prev);
  const nextFp = widgetTreeFingerprint(next);

  const prevIds = new Set(Object.keys(prev));
  const nextIds = new Set(Object.keys(next));
  const added = [...nextIds].filter((id) => !prevIds.has(id));
  const removed = [...prevIds].filter((id) => !nextIds.has(id));

  if (patchCount > 6 && (added.length > 2 || removed.length > 2)) {
    return {
      drifted: true,
      reason: `large structural change (+${added.length}/-${removed.length})`,
    };
  }

  if (prevFp !== nextFp && patchCount === 0) {
    return { drifted: true, reason: "fingerprint changed without patches" };
  }

  return { drifted: false };
}
