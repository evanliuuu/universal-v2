/**
 * Lightweight session API tokens.
 * Prefer room-stored tokens from SessionRoom; this helper mints share URLs.
 */

export function createSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

export function parseShareParams(
  search: string,
): { sessionId?: string; token?: string } {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  const sessionId = params.get("session") ?? undefined;
  const token = params.get("token") ?? undefined;
  return { sessionId, token };
}

export function buildShareQuery(sessionId: string, token: string): string {
  const params = new URLSearchParams({ session: sessionId, token });
  return params.toString();
}
