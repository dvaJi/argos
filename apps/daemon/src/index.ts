import { resolve } from "node:path";
import { serve } from "bun";
import { handleRouteDispatch, dispatchRoute, setRouteDispatcher } from "./transport/http";
import type { RouteDispatcher } from "./transport/http";
import { authorize } from "./transport/auth";
import type { AuthGateConfig, ExposureMode } from "@argos/shared-contracts/auth";
import { handlePair, handleListSessions, handleRevokeSession, handleIssuePairingToken } from "./transport/auth-routes";
import { SessionAuthRepository } from "./host/session-auth-repository";
import { BunPathResolver } from "./host/bun-paths";
import { DaemonConfigPresenter } from "./host/daemonConfigPresenter";
import { BunEventPublisher } from "./host/bun-event-publisher";
import { initializeDatabase } from "./host/db-init";
import { createDaemonDispatcher } from "./dispatch/daemonDispatcher";
import { BunProviderExecutionPort } from "./host/bun-provider-execution";
import { logger } from "./logging";
import { checkForUpdate, runSelfUpdate } from "./update";
import { resolveDaemonVersion } from "./version";
import { parseArgs, mergeOptions, ensureDirectories, setupGracefulShutdown, type DaemonOptions } from "./lifecycle";

const startTime = Date.now();

function isNonLoopbackHost(host: string): boolean {
  return host !== "127.0.0.1" && host !== "localhost" && host !== "::1";
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".map": "application/json; charset=utf-8",
};

function serveStaticWeb(webRoot: string, pathname: string): Response {
  const safePath = pathname
    .split("/")
    .filter((s) => s !== ".." && s !== ".")
    .join("/");
  const resolvedRoot = resolve(webRoot);

  const tryFile = (relativePath: string): Bun.BunFile | null => {
    const file = Bun.file(`${resolvedRoot}/${relativePath}`);
    return file.size > 0 ? file : null;
  };

  const file = tryFile(safePath || "index.html");
  if (file) {
    const ext = safePath.match(/\.[^.]+$/)?.[0] ?? "";
    const isHashedAsset = safePath.startsWith("assets/");
    return new Response(file, {
      headers: {
        "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream",
        "Cache-Control": isHashedAsset ? "public, max-age=31536000, immutable" : "no-cache",
      },
    });
  }

  const indexFile = tryFile("index.html");
  if (indexFile) {
    return new Response(indexFile, {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" },
    });
  }

  return Response.json({ ok: false, error: { code: "not_found", message: "Web assets not found" } }, { status: 404 });
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
  desktopBootstrapSecret?: string;
  web?: boolean;
  webRoot?: string;
  pair?: boolean;
  noUpdateCheck?: boolean;
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

  const sessionAuthRepo = new SessionAuthRepository(db);

  const dispatcher =
    options?.dispatcher ??
    createDaemonDispatcher(configPresenter as any, eventPublisher, sessionRepository, providerExecutionPort);
  setRouteDispatcher(dispatcher);

  const host = options?.host || "127.0.0.1";
  const port = options?.port ?? 9527;

  const exposureMode: ExposureMode = isNonLoopbackHost(host) ? "network-accessible" : "local-only";
  const authConfig: AuthGateConfig = {
    exposureMode,
    desktopBootstrapSecret: options?.desktopBootstrapSecret,
    verifySession: (secret) => Promise.resolve(sessionAuthRepo.verifySession(secret)),
  };

  const webRoot = options?.web ? resolve(options?.webRoot || "./web") : null;

  const server = serve({
    hostname: host,
    port,
    async fetch(request, server) {
      const url = new URL(request.url);

      if (url.pathname === "/health") {
        return Response.json({
          status: "ok",
          version: resolveDaemonVersion(),
          uptime: Date.now() - startTime,
        });
      }

      if (webRoot && !url.pathname.startsWith("/api/")) {
        return serveStaticWeb(webRoot, url.pathname);
      }

      if (url.pathname === "/api/v1/pair" && request.method === "POST") {
        return handlePair(request, sessionAuthRepo);
      }

      const authResult = await authorize(request, authConfig);
      if (!authResult.ok) {
        return Response.json(
          { ok: false, error: { code: authResult.code, message: authResult.message } },
          { status: authResult.status },
        );
      }

      if (url.pathname === "/api/v1/route" && request.method === "POST") {
        return handleRouteDispatch(request);
      }

      if (url.pathname === "/api/v1/sessions" && request.method === "GET") {
        return handleListSessions(sessionAuthRepo);
      }

      if (url.pathname === "/api/v1/pair/token" && request.method === "POST") {
        return handleIssuePairingToken(sessionAuthRepo, url.origin);
      }

      if (url.pathname.startsWith("/api/v1/sessions/") && request.method === "DELETE") {
        const sessionId = url.pathname.slice("/api/v1/sessions/".length);
        return handleRevokeSession(sessionAuthRepo, sessionId);
      }

      if (url.pathname === "/api/v1/events") {
        const success = (server as any).upgrade(request, {
          data: {
            subscriptions: new Set<string>(),
            authContext: authResult.context,
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
      async message(ws: any, message: string | Buffer) {
        if (typeof message !== "string") return;
        let parsed: any;
        try {
          parsed = JSON.parse(message);
        } catch {
          return;
        }

        if (parsed.type === "route" && parsed.requestId) {
          const result = await dispatchRoute(parsed.route, parsed.input);
          ws.send(
            JSON.stringify({
              type: "route:response",
              requestId: parsed.requestId,
              ok: result.ok,
              ...(result.ok ? { output: result.output } : { error: result.error }),
            }),
          );
        } else if (parsed.type === "subscribe" && Array.isArray(parsed.events)) {
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
      },
    } as any,
  });

  const serverPort = (server as any).port ?? port;
  logger.info(`[daemon] Listening on http://${host}:${serverPort}`);
  logger.info(`[daemon] Health: http://${host}:${serverPort}/health`);
  logger.info(`[daemon] Routes: POST http://${host}:${serverPort}/api/v1/route`);
  logger.info(`[daemon] Events: ws://${host}:${serverPort}/api/v1/events`);
  if (webRoot) {
    logger.info(`[daemon] Web UI: http://${host}:${serverPort}`);
  }

  if (options?.pair) {
    const pairing = sessionAuthRepo.issuePairingToken("cli");
    const scheme = webRoot ? "http" : "http";
    console.log(`\n  Pairing URL: ${scheme}://${host}:${serverPort}/pair?token=${pairing.token}\n`);
    logger.info(`[daemon] Pairing token expires at ${new Date(pairing.expiresAt).toISOString()}`);
  }

  if (!options?.noUpdateCheck) {
    void checkForUpdate().then((check) => {
      if (!check) return; // offline or rate-limited — stay silent
      if (check.hasUpdate) {
        logger.info(
          `[daemon] Update available: v${check.latest} (current v${check.current}). Run \`argos-daemon update\`.`,
        );
      } else {
        logger.info(`[daemon] Up to date (v${check.current}).`);
      }
    });
  }

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
  if (process.argv.includes("--version") || process.argv.includes("-V")) {
    console.log(resolveDaemonVersion());
    process.exit(0);
  }

  if (process.argv[2] === "update") {
    const rest = process.argv.slice(3);
    const flagValue = (name: string) => {
      const i = rest.indexOf(name);
      return i >= 0 ? rest[i + 1] : undefined;
    };
    await runSelfUpdate({
      installDir: flagValue("--install-dir"),
      token: flagValue("--token") || process.env.GITHUB_TOKEN,
    });
    process.exit(0);
  }

  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(`
Argos Daemon - Headless backend server

Usage:
  argos-daemon [options]          Start the server
  argos-daemon update [options]   Update to the latest release

Options:
  --version, -V       Print the daemon version and exit
  --host <host>       Bind address (default: 127.0.0.1)
  --port <port>       Bind port (default: 9527, 0 for auto)
  --data-dir <path>   Data directory (default: ~/.argos-daemon)
  --web               Serve the web UI (requires --web-root or ARGOS_WEB_ROOT)
  --web-root <path>   Web asset directory (default: ./web)
  --pair              Generate a one-time pairing token and print the URL
  --log-level <level> Log level: debug, info, warn, error (default: info)
  --no-update-check   Skip the startup update-available check
  -h, --help          Show this help

Update options:
  --install-dir <path>  Install directory to update (default: location of this binary)
  --token <token>       GitHub API token (optional, raises rate limits)

Environment variables:
  ARGOS_HOST           Same as --host
  ARGOS_PORT           Same as --port
  ARGOS_DATA_DIR       Same as --data-dir
  ARGOS_DESKTOP_BOOTSTRAP  Desktop bootstrap secret (set by Electron main)
  ARGOS_WEB            Same as --web (1/true)
  ARGOS_WEB_ROOT       Same as --web-root
  ARGOS_LOG_LEVEL      Same as --log-level
  ARGOS_NO_UPDATE_CHECK  Same as --no-update-check
`);
    process.exit(0);
  }

  const parsed = parseArgs(process.argv);
  const opts = mergeOptions(parsed, process.env);

  if (opts.logLevel) {
    logger.setLevel(opts.logLevel as any);
  }

  if (isNonLoopbackHost(opts.host || "127.0.0.1") && !opts.desktopBootstrap) {
    logger.warn(`[daemon] Non-loopback host "${opts.host}" without ARGOS_DESKTOP_BOOTSTRAP.`);
    logger.warn(`[daemon] Non-loopback requests will be rejected until pairing/session auth is available.`);
  }

  startDaemon({
    dataDir: opts.dataDir,
    host: opts.host,
    port: opts.port,
    desktopBootstrapSecret: opts.desktopBootstrap,
    web: opts.web,
    webRoot: opts.webRoot,
    pair: opts.pair,
    noUpdateCheck: opts.noUpdateCheck,
  }).catch((error) => {
    logger.error("[daemon] Failed to start:", error);
    process.exit(1);
  });
}
