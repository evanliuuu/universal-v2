import { AgentResponse } from "../protocol/types";
import { eventKey } from "../protocol/messages";
import { SemanticEvent } from "../protocol/types";

export class PrefetchCache {
  private cache = new Map<string, AgentResponse>();
  private inFlight = new Set<string>();
  hits = 0;
  misses = 0;

  get(event: SemanticEvent): AgentResponse | undefined {
    const key = eventKey(event);
    const hit = this.cache.get(key);
    if (hit) {
      this.hits++;
      this.cache.delete(key);
      return hit;
    }
    this.misses++;
    return undefined;
  }

  set(event: SemanticEvent, response: AgentResponse) {
    this.cache.set(eventKey(event), response);
  }

  has(event: SemanticEvent): boolean {
    return this.cache.has(eventKey(event));
  }

  markInFlight(key: string) {
    this.inFlight.add(key);
  }

  clearInFlight(key: string) {
    this.inFlight.delete(key);
  }

  isInFlight(key: string): boolean {
    return this.inFlight.has(key);
  }

  clear() {
    this.cache.clear();
    this.inFlight.clear();
  }

  stats() {
    return { hits: this.hits, misses: this.misses, pending: this.cache.size };
  }
}

/** Likely next dock interactions after a frame settles. */
export function likelyPrefetchEvents(state: {
  desktop: { dock: string[] };
  windows: Record<string, unknown>;
}): SemanticEvent[] {
  const at = new Date().toISOString();
  return state.desktop.dock.map((targetId) => ({
    type: "click" as const,
    targetId,
    at,
  }));
}
