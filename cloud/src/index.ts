/**
 * Cloudflare Worker entry — routes HTTP + WebSocket upgrades to a
 * Durable Object per session.
 */
import { SessionDurableObject } from "./session-do";

export { SessionDurableObject };

export interface Env {
  SESSIONS: DurableObjectNamespace;
  UNIVERSAL_API_SECRET?: string;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    },
  });
}

function sessionStub(env: Env, sessionId: string) {
  const id = env.SESSIONS.idFromName(sessionId);
  return env.SESSIONS.get(id);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return json({ ok: true });
    }

    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({ ok: true, service: "universal-v2-cloud", edge: true });
    }

    if (url.pathname === "/" && request.method === "GET") {
      return json({
        ok: true,
        service: "universal-v2-cloud",
        routes: [
          "/health",
          "POST /sessions",
          "GET /sessions/:id",
          "GET /sessions/:id/events",
          "GET /ws?sessionId=&token=",
        ],
      });
    }

    if (url.pathname === "/sessions" && request.method === "POST") {
      const secret = env.UNIVERSAL_API_SECRET;
      if (secret) {
        const auth = request.headers.get("Authorization") ?? "";
        if (auth !== `Bearer ${secret}`) {
          return json({ error: "unauthorized" }, 401);
        }
      }
      const sessionId = crypto.randomUUID();
      const stub = sessionStub(env, sessionId);
      const res = await stub.fetch(
        new Request("https://do/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        }),
      );
      const body = await res.json();
      return json(body, res.status);
    }

    const sessionMatch = url.pathname.match(/^\/sessions\/([^/]+)(?:\/(events))?$/);
    if (sessionMatch && request.method === "GET") {
      const sessionId = decodeURIComponent(sessionMatch[1]);
      const stub = sessionStub(env, sessionId);
      const path = sessionMatch[2] === "events" ? "/events" : "/session";
      const token = url.searchParams.get("token") ?? "";
      return stub.fetch(
        new Request(
          `https://do${path}?token=${encodeURIComponent(token)}&sessionId=${encodeURIComponent(sessionId)}`,
          { method: "GET" },
        ),
      );
    }

    if (url.pathname === "/ws") {
      const sessionId = url.searchParams.get("sessionId");
      const token = url.searchParams.get("token") ?? "";
      if (!sessionId) return json({ error: "sessionId required" }, 400);
      if (request.headers.get("Upgrade") !== "websocket") {
        return json({ error: "expected websocket upgrade" }, 426);
      }
      const stub = sessionStub(env, sessionId);
      return stub.fetch(
        new Request(
          `https://do/ws?token=${encodeURIComponent(token)}&sessionId=${encodeURIComponent(sessionId)}`,
          request,
        ),
      );
    }

    return json({ error: "not found" }, 404);
  },
};
