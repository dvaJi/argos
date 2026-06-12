import { serve } from "bun";
import { handleRouteDispatch, setRouteDispatcher } from "./transport/http";
import type { RouteDispatcher } from "./transport/http";
import { authenticate } from "./transport/auth";
import { BunPathResolver } from "./host/bun-paths";
import { DaemonConfigPresenter } from "./host/daemonConfigPresenter";
import { createDaemonDispatcher } from "./dispatch/daemonDispatcher";

const HOST = process.env.ARGOS_HOST || "127.0.0.1";
const PORT = parseInt(process.env.ARGOS_PORT || "0", 10) || 9527;
const TOKEN = process.env.ARGOS_TOKEN || "";
const DATA_DIR = process.env.ARGOS_DATA_DIR || "";

const startTime = Date.now();

function isLocalRequest(request: Request): boolean {
  const url = new URL(request.url);
  return url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1";
}

export function startDaemon(options?: { dispatcher?: RouteDispatcher; dataDir?: string }): {
  port: number;
  close: () => void;
} {
  if (options?.dispatcher) {
    setRouteDispatcher(options.dispatcher);
  } else {
    const paths = new BunPathResolver(options?.dataDir || DATA_DIR || undefined);
    const configPresenter = new DaemonConfigPresenter(paths.getConfigDir());
    const dispatcher = createDaemonDispatcher(configPresenter);
    setRouteDispatcher(dispatcher);
  }

  const server = serve({
    hostname: HOST,
    port: PORT,
    async fetch(request, server) {
      const url = new URL(request.url);

      if (url.pathname === "/health") {
        return Response.json({
          status: "ok",
          version: "1.0.6-beta.2",
          uptime: Date.now() - startTime,
        });
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

  console.log(`Argos daemon listening on http://${HOST}:${server.port}`);
  console.log(`Health: http://${HOST}:${server.port}/health`);
  console.log(`Routes: POST http://${HOST}:${server.port}/api/v1/route`);
  console.log(`Events: ws://${HOST}:${server.port}/api/v1/events`);

  return { port: server.port, close: () => server.stop() };
}

if (import.meta.main) {
  startDaemon();
}
