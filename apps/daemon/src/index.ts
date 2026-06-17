import { serve } from "bun";
import { handleRouteDispatch, setRouteDispatcher } from "./transport/http";
import type { RouteDispatcher } from "./transport/http";
import { authenticate } from "./transport/auth";
import { BunPathResolver } from "./host/bun-paths";
import { DaemonConfigPresenter } from "./host/daemonConfigPresenter";
import { BunEventPublisher } from "./host/bun-event-publisher";
import { initializeDatabase } from "./host/db-init";
import { createDaemonDispatcher } from "./dispatch/daemonDispatcher";
import { BunProviderExecutionPort } from "./host/bun-provider-execution";
import { logger } from "./logging";
import {
  parseArgs,
  mergeOptions,
  ensureDirectories,
  setupGracefulShutdown,
  generateToken,
  type DaemonOptions,
} from "./lifecycle";

const startTime = Date.now();

function isLocalRequest(request: Request): boolean {
  const url = new URL(request.url);
  return url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1";
}

export type DaemonHandle = {
  port: number;
  close: () => Promise<void>;
  eventPublisher: BunEventPublisher;
};

export async function startDaemon(options?: {
  dispatcher?: RouteDispatcher;
  dataDir?: string;
  host?: string;
  port?: number;
  token?: string;
}): Promise<DaemonHandle> {
  const paths = new BunPathResolver(options?.dataDir);
  ensureDirectories(paths);

  logger.info("[daemon] Initializing database...");
  const db = await initializeDatabase(paths.getDatabasePath());

  const eventPublisher = new BunEventPublisher();
  const configPresenter = new DaemonConfigPresenter(paths.getConfigDir());

  const { BunSessionRepository } = await import("./host/bun-session-repository");
  const sessionRepository = new BunSessionRepository(db);

  const sessions = await sessionRepository.list();
  logger.info(`[daemon] Restored ${sessions.length} session(s) from database`);

  await sessionRepository.deactivate(0);
  if (sessions.length > 0) {
    logger.info(`[daemon] Reset active sessions to idle`);
  }

  const providerExecutionPort = new BunProviderExecutionPort(configPresenter, sessionRepository);

  const dispatcher =
    options?.dispatcher ??
    createDaemonDispatcher(configPresenter as any, eventPublisher, sessionRepository, providerExecutionPort);
  setRouteDispatcher(dispatcher);

  const host = options?.host || "127.0.0.1";
  const port = options?.port ?? 9527;
  const token = options?.token || "";

  const server = serve({
    hostname: host,
    port,
    async fetch(request, server) {
      const url = new URL(request.url);

      if (url.pathname === "/health") {
        return Response.json({
          status: "ok",
          version: "0.1.0",
          uptime: Date.now() - startTime,
        });
      }

      if (!isLocalRequest(request) && token) {
        const authResult = authenticate(request, token);
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
        const wsToken = url.searchParams.get("token");
        if (token && wsToken !== token) {
          return Response.json(
            { ok: false, error: { code: "unauthorized", message: "Invalid WebSocket token" } },
            { status: 401 },
          );
        }

        const success = (server as any).upgrade(request, {
          data: {
            subscriptions: new Set<string>(),
          },
        });
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
      open(ws: any) {
        eventPublisher.addClient(ws);
        ws.subscribe("events");
      },
      close(ws: any) {
        eventPublisher.removeClient(ws);
        ws.unsubscribe("events");
      },
      message(ws: any, message: string | Buffer) {
        if (typeof message !== "string") return;
        try {
          const parsed = JSON.parse(message);
          if (parsed.type === "subscribe" && Array.isArray(parsed.events)) {
            for (const eventName of parsed.events) {
              ws.subscribe(`event:${eventName}`);
              ws.data.subscriptions.add(eventName);
            }
          } else if (parsed.type === "unsubscribe" && Array.isArray(parsed.events)) {
            for (const eventName of parsed.events) {
              ws.unsubscribe(`event:${eventName}`);
              ws.data.subscriptions.delete(eventName);
            }
          }
        } catch {
          // ignore malformed messages
        }
      },
    } as any,
  });

  const serverPort = (server as any).port ?? port;
  logger.info(`[daemon] Listening on http://${host}:${serverPort}`);
  logger.info(`[daemon] Health: http://${host}:${serverPort}/health`);
  logger.info(`[daemon] Routes: POST http://${host}:${serverPort}/api/v1/route`);
  logger.info(`[daemon] Events: ws://${host}:${serverPort}/api/v1/events`);

  setupGracefulShutdown(eventPublisher, { stop: () => (server as any).stop() }, () => {
    try {
      db.close();
      logger.info("[daemon] Database closed");
    } catch {
      logger.warn("[daemon] Failed to close database cleanly");
    }
  });

  return {
    port: serverPort,
    close: async () => {
      (server as any).stop();
    },
    eventPublisher,
  };
}

if (import.meta.main) {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(`
Argos Daemon - Headless backend server

Usage: argos-daemon [options]

Options:
  --host <host>      Bind address (default: 127.0.0.1)
  --port <port>      Bind port (default: 9527, 0 for auto)
  --data-dir <path>  Data directory (default: ~/.argos-daemon)
  --token <token>    Auth token for remote access
  --with-token       Auto-generate an auth token and print it
  --log-level <level> Log level: debug, info, warn, error (default: info)
  -h, --help         Show this help

Environment variables:
  ARGOS_HOST         Same as --host
  ARGOS_PORT         Same as --port
  ARGOS_DATA_DIR     Same as --data-dir
  ARGOS_TOKEN        Same as --token
  ARGOS_LOG_LEVEL    Same as --log-level
`);
    process.exit(0);
  }

  const parsed = parseArgs(process.argv);
  const opts = mergeOptions(parsed, process.env);

  if (opts.logLevel) {
    logger.setLevel(opts.logLevel as any);
  }

  let token = opts.token;
  if (opts.withToken) {
    token = generateToken();
    console.log(`\n  Token: ${token}\n`);
  } else if (!token && opts.host !== "127.0.0.1" && opts.host !== "localhost") {
    token = generateToken();
    logger.info(`[daemon] No token provided, generated: ${token}`);
    logger.info(`[daemon] Set ARGOS_TOKEN or pass --token for remote access.`);
  }

  startDaemon({
    dataDir: opts.dataDir,
    host: opts.host,
    port: opts.port,
    token,
  }).catch((error) => {
    logger.error("[daemon] Failed to start:", error);
    process.exit(1);
  });
}
