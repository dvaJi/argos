import { serve } from "bun";
import { handleRouteDispatch } from "./transport/http";
import { handleWebSocketUpgrade, broadcastEvent } from "./transport/websocket";
import { authenticate } from "./transport/auth";

const HOST = process.env.ARGOS_HOST || "127.0.0.1";
const PORT = parseInt(process.env.ARGOS_PORT || "0", 10) || 9527;
const TOKEN = process.env.ARGOS_TOKEN || "";
const DATA_DIR = process.env.ARGOS_DATA_DIR || "";

const startTime = Date.now();

function isLocalRequest(request: Request): boolean {
  const url = new URL(request.url);
  return url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1";
}

function healthResponse(): Response {
  return Response.json({
    status: "ok",
    version: "1.0.6-beta.2",
    uptime: Date.now() - startTime,
  });
}

serve({
  hostname: HOST,
  port: PORT,
  async fetch(request, server) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return healthResponse();
    }

    if (!isLocalRequest(request) && TOKEN) {
      const authResult = authenticate(request, TOKEN);
      if (!authResult.ok) {
        return Response.json(
          { ok: false, error: { code: "unauthorized", message: authResult.error } },
          { status: 401 },
        );
      }
    }

    if (url.pathname === "/api/v1/route" && request.method === "POST") {
      return handleRouteDispatch(request);
    }

    if (url.pathname === "/api/v1/events") {
      const success = server.upgrade(request);
      if (!success) {
        return Response.json(
          { ok: false, error: { code: "upgrade_failed", message: "WebSocket upgrade failed" } },
          { status: 500 },
        );
      }
      return undefined as unknown as Response;
    }

    return Response.json({ ok: false, error: { code: "not_found", message: "Unknown route" } }, { status: 404 });
  },
  websocket: {
    open(ws) {
      ws.subscribe("events");
    },
    close(ws) {
      ws.unsubscribe("events");
    },
    message(ws, message) {
      if (typeof message === "string") {
        try {
          const parsed = JSON.parse(message);
          if (parsed.type === "subscribe" && Array.isArray(parsed.events)) {
            for (const eventName of parsed.events) {
              ws.subscribe(`event:${eventName}`);
            }
          }
        } catch {}
      }
    },
  },
});

console.log(`Argos daemon listening on http://${HOST}:${PORT}`);
console.log(`Health endpoint: http://${HOST}:${PORT}/health`);
console.log(`Route dispatch: POST http://${HOST}:${PORT}/api/v1/route`);
console.log(`Events: ws://${HOST}:${PORT}/api/v1/events`);

export { broadcastEvent };
