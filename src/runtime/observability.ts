import { ExecutionTier, SemanticEvent } from "../protocol/types";

export type FailureKind = "budget" | "patch" | "sync" | "unknown";

export type RuntimeFailure = {
  kind: FailureKind;
  message: string;
  detail: string;
  event?: SemanticEvent;
  recoverable: boolean;
  recoveryLabel: string;
};

export type LatencySample = {
  tier: string;
  ms: number;
};

const BUCKETS = [
  { label: "<5ms", max: 5 },
  { label: "5–16ms", max: 16 },
  { label: "16–50ms", max: 50 },
  { label: "50–200ms", max: 200 },
  { label: "200ms+", max: Infinity },
];

export function explainFailure(kind: FailureKind, raw: string): RuntimeFailure {
  if (kind === "budget") {
    return {
      kind,
      message: "Token budget exhausted",
      detail:
        raw ||
        "The agent stopped so this session wouldn't keep spending tokens. Raise the limit to continue.",
      recoverable: true,
      recoveryLabel: "Raise limit and retry",
    };
  }
  if (kind === "patch") {
    return {
      kind,
      message: "Patch rejected",
      detail: `The change did not apply to the current document. ${raw}`.trim(),
      recoverable: true,
      recoveryLabel: "Retry last action",
    };
  }
  if (kind === "sync") {
    return {
      kind,
      message: "Sync rejected",
      detail: raw,
      recoverable: true,
      recoveryLabel: "Retry last action",
    };
  }
  return {
    kind: "unknown",
    message: "Something went wrong",
    detail: raw,
    recoverable: Boolean(raw),
    recoveryLabel: "Retry",
  };
}

export function histogram(samples: LatencySample[]): Array<{
  label: string;
  count: number;
}> {
  const counts = BUCKETS.map((b) => ({ label: b.label, count: 0 }));
  for (const sample of samples) {
    const idx = BUCKETS.findIndex((b) => sample.ms < b.max);
    counts[idx === -1 ? counts.length - 1 : idx].count += 1;
  }
  return counts;
}

export function summarizeByTier(samples: LatencySample[]): Record<
  string,
  { count: number; avgMs: number; maxMs: number }
> {
  const out: Record<string, { count: number; avgMs: number; maxMs: number }> =
    {};
  for (const sample of samples) {
    const cur = out[sample.tier] ?? { count: 0, avgMs: 0, maxMs: 0 };
    const nextCount = cur.count + 1;
    cur.avgMs = (cur.avgMs * cur.count + sample.ms) / nextCount;
    cur.maxMs = Math.max(cur.maxMs, sample.ms);
    cur.count = nextCount;
    out[sample.tier] = cur;
  }
  return out;
}

export class SessionHealth {
  private samples: LatencySample[] = [];

  record(tier: ExecutionTier | string, ms: number) {
    this.samples.unshift({ tier, ms });
    if (this.samples.length > 200) this.samples.length = 200;
  }

  clear() {
    this.samples = [];
  }

  snapshot() {
    return {
      samples: this.samples,
      byTier: summarizeByTier(this.samples),
      buckets: histogram(this.samples),
      lastMs: this.samples[0]?.ms,
      lastTier: this.samples[0]?.tier,
    };
  }
}
