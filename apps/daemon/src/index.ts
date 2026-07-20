import { serve } from "bun";
import { resolve } from "node:path";
import { handleRouteDispatch, dispatchRoute, setRouteDispatcher } from "./transport/http";
import type { RouteDispatcher } from "./transport/http";
import { authorize } from "./transport/auth";
import type { AuthGateConfig, ExposureMode } from "@argos/shared-contracts/auth";
import { handlePair, handleListSessions, handleRevokeSession, handleIssuePairingToken } from "./transport/auth-routes";
import { SessionAuthRepository } from "./host/session-auth-repository";
import { BunPathResolver } from "./host/bun-paths";
import { DaemonConfigPresenter } from "./host/daemonConfigPresenter";
import { DaemonArgosAgentRuntime } from "./host/daemonArgosAgentRuntime";
import { BunEventPublisher } from "./host/bun-event-publisher";
import { initializeDatabase } from "./host/db-init";
import { createDaemonDispatcher } from "./dispatch/daemonDispatcher";
import { ProviderImportService } from "@argos/backend-core";
import { AiSdkProviderExecutionPort } from "./host/aiSdk-provider-execution";
import { AcpProviderExecutionPort } from "./host/acp-provider-execution";
import { createDaemonMcpPorts } from "./host/daemonMcpPorts";
import { DaemonMcpRuntime } from "./host/daemonMcpRuntime";
import { DaemonSkillRuntime } from "./host/daemonSkillRuntime";
import { DaemonSyncRuntime } from "./host/daemonSyncRuntime";
import { DaemonMemoryRuntime } from "./host/daemonMemoryRuntime";
import { DaemonRemoteControlRuntime } from "./host/daemonRemoteControlRuntime";
import { DaemonPluginPresenter } from "./host/daemonPluginPresenter";
import { DaemonScheduledTasks } from "./host/daemonScheduledTasks";
import { logger } from "./logging";
import { checkForUpdate, runSelfUpdate } from "./update";
import { resolveDaemonVersion } from "./version";
import type { ProviderExecutionPort } from "@argos/backend-core";
import type { SendMessageInput, ToolInteractionResponse } from "@argos/shared/types/agent-interface";
import {
  parseArgs,
  mergeOptions,
  ensureDirectories,
  setupGracefulShutdown,
  resolveWebRoot,
  type DaemonOptions,
} from "./lifecycle";

type DaemonProviderExecutionPort = Required<
  Pick<
    ProviderExecutionPort,
    | "sendMessage"
    | "getActiveGeneration"
    | "steerActiveTurn"
    | "respondToolInteraction"
    | "cancelGeneration"
    | "testConnection"
    | "generateCompletion"
    | "transcribeAudio"
    | "warmupAcpProcess"
    | "getAcpProcessConfigOptions"
    | "runAcpDebugAction"
    | "getAcpAgentDiagnostics"
  >
>;

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

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const PLUGIN_SETTINGS_BRIDGE_SOURCE = String.raw`(() => {
  const scriptUrl = new URL(document.currentScript.src);
  const pluginId = scriptUrl.searchParams.get("pluginId") || "";
  const pending = new Map();
  let requestCounter = 0;

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (!message || message.source !== "argos-plugin-settings-host" || typeof message.requestId !== "string") return;
    const request = pending.get(message.requestId);
    if (!request) return;
    pending.delete(message.requestId);
    if (message.ok) request.resolve(message.value);
    else request.reject(new Error(message.error || "Plugin settings request failed"));
  });

  const request = (method, args = []) => new Promise((resolve, reject) => {
    const requestId = String(++requestCounter);
    pending.set(requestId, { resolve, reject });
    window.parent.postMessage({
      source: "argos-plugin-settings-frame",
      requestId,
      pluginId,
      method,
      args,
    }, "*");
  });

  Object.defineProperty(window, "argosPlugin", {
    configurable: false,
    enumerable: true,
    writable: false,
    value: Object.freeze({
      getPluginId: () => pluginId,
      getStatus: () => request("getStatus"),
      enable: () => request("enable"),
      disable: () => request("disable"),
      invokeAction: (actionId, payload) => request("invokeAction", [actionId, payload]),
    }),
  });
})();`;

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function serveStaticWeb(webRoot: string, pathname: string): Response {
  const safePath = pathname
    .split("/")
    .filter((s) => s.length > 0 && s !== ".." && s !== ".")
    .join("/");
  const resolvedRoot = resolve(webRoot);

  const tryFile = (relativePath: string): Bun.BunFile | null => {
    const file = Bun.file(`${resolvedRoot}/${relativePath}`);
    return file.size > 0 ? file : null;
  };

  const relativeFilePath = safePath || "index.html";
  const file = tryFile(relativeFilePath);
  if (file) {
    const ext = relativeFilePath.match(/\.[^.]+$/)?.[0] ?? "";
    const isHashedAsset = relativeFilePath.startsWith("assets/");
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

async function servePluginSettingsAsset(
  pluginPresenter: DaemonPluginPresenter,
  pluginId: string,
  assetPath: string,
): Promise<Response> {
  const entry = pluginPresenter.resolveSettingsWebAsset(pluginId, "");
  if (!entry) {
    return Response.json(
      { ok: false, error: { code: "not_found", message: "Plugin settings not found" } },
      { status: 404 },
    );
  }

  if (assetPath === "__argos_bridge.js") {
    return new Response(PLUGIN_SETTINGS_BRIDGE_SOURCE, {
      headers: {
        "Content-Type": MIME_TYPES[".js"],
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  const asset = pluginPresenter.resolveSettingsWebAsset(pluginId, assetPath);
  if (!asset) {
    return Response.json(
      { ok: false, error: { code: "not_found", message: "Plugin settings asset not found" } },
      { status: 404 },
    );
  }

  const ext = asset.filePath.match(/\.[^.]+$/)?.[0] ?? "";
  if (asset.isEntry) {
    const html = await Bun.file(asset.filePath).text();
    const bridgeTag = `<script src="./__argos_bridge.js?pluginId=${encodeURIComponent(pluginId)}"></script>`;
    const content = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${bridgeTag}</head>`) : `${bridgeTag}${html}`;
    return new Response(content, {
      headers: {
        "Content-Type": MIME_TYPES[".html"],
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  return new Response(Bun.file(asset.filePath), {
    headers: {
      "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
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
  const webRootResolution = options?.web ? resolveWebRoot({ explicitWebRoot: options.webRoot }) : null;
  if (webRootResolution && !webRootResolution.ok) {
    throw new Error(webRootResolution.message);
  }
  const webRoot = webRootResolution?.ok ? webRootResolution.root : null;

  const paths = new BunPathResolver(options?.dataDir);
  ensureDirectories(paths);

  logger.info("[daemon] Initializing database...");
  const db = await initializeDatabase(paths.getDatabasePath());

  const eventPublisher = new BunEventPublisher();
  const configPresenter = new DaemonConfigPresenter(paths.getConfigDir(), paths.getDataDir(), db);
  await configPresenter.initializeMcpHeadlessDefaults();

  const argosAgentRuntimeHost = new DaemonArgosAgentRuntime(db);
  argosAgentRuntimeHost.ensureBuiltinAgent();
  configPresenter.setArgosAgentRuntime(argosAgentRuntimeHost.runtime);
  logger.info("[daemon] Argos agent runtime initialized");

  const { BunSessionRepository } = await import("./host/bun-session-repository");
  const sessionRepository = new BunSessionRepository(db, eventPublisher);

  const sessions = await sessionRepository.list();
  logger.info(`[daemon] Restored ${sessions.length} session(s) from database`);

  await sessionRepository.deactivate(0);
  if (sessions.length > 0) {
    logger.info(`[daemon] Reset active sessions to idle`);
  }

  const httpProviderExecutionPort = new AiSdkProviderExecutionPort(
    configPresenter,
    sessionRepository,
    eventPublisher,
    (sessionId) => mcpRuntime.listToolDefinitions(),
  );
  const acpProviderExecutionPort = new AcpProviderExecutionPort(configPresenter, sessionRepository, eventPublisher, {
    dataDir: paths.getDataDir(),
    appVersion: resolveDaemonVersion(),
    db,
  });

  // Route execution by session provider: ACP-backed sessions go to the ACP port,
  // everything else to the HTTP/LLM port.
  const providerExecutionPort: DaemonProviderExecutionPort = {
    ...httpProviderExecutionPort,
    getActiveGeneration(sessionId) {
      return (
        acpProviderExecutionPort.getActiveGeneration(sessionId) ??
        httpProviderExecutionPort.getActiveGeneration(sessionId)
      );
    },
    async sendMessage(sessionId, content) {
      const session = await sessionRepository.get(sessionId);
      return (session as any)?.providerId === "acp"
        ? acpProviderExecutionPort.sendMessage(sessionId, content)
        : httpProviderExecutionPort.sendMessage(sessionId, content);
    },
    async steerActiveTurn(sessionId, content) {
      const session = await sessionRepository.get(sessionId);
      return (session as any)?.providerId === "acp"
        ? acpProviderExecutionPort.steerActiveTurn(sessionId, content)
        : httpProviderExecutionPort.steerActiveTurn(sessionId, content);
    },
    async respondToolInteraction(sessionId, messageId, toolCallId, response) {
      const session = await sessionRepository.get(sessionId);
      return (session as any)?.providerId === "acp"
        ? acpProviderExecutionPort.respondToolInteraction(sessionId, messageId, toolCallId, response)
        : httpProviderExecutionPort.respondToolInteraction(sessionId, messageId, toolCallId, response);
    },
    async cancelGeneration(sessionId) {
      const session = await sessionRepository.get(sessionId);
      return (session as any)?.providerId === "acp"
        ? acpProviderExecutionPort.cancelGeneration(sessionId)
        : httpProviderExecutionPort.cancelGeneration(sessionId);
    },
    async testConnection(providerId, modelId) {
      return providerId === "acp"
        ? acpProviderExecutionPort.testConnection(providerId, modelId)
        : httpProviderExecutionPort.testConnection(providerId, modelId);
    },
    async generateCompletion(input) {
      return httpProviderExecutionPort.generateCompletion(input);
    },
    async transcribeAudio(providerId, modelId, audioBase64, mimeType, filename) {
      return httpProviderExecutionPort.transcribeAudio(providerId, modelId, audioBase64, mimeType, filename);
    },
    async warmupAcpProcess(agentId, workdir) {
      return acpProviderExecutionPort.warmupAcpProcess(agentId, workdir);
    },
    async getAcpProcessConfigOptions(agentId, workdir) {
      return acpProviderExecutionPort.getAcpProcessConfigOptions(agentId, workdir);
    },
    async runAcpDebugAction(request) {
      return acpProviderExecutionPort.runAcpDebugAction(request);
    },
    async getAcpAgentDiagnostics(agentId, workdir) {
      return acpProviderExecutionPort.getAcpAgentDiagnostics(agentId, workdir);
    },
  };

  const sessionAuthRepo = new SessionAuthRepository(db);

  const mcpPorts = createDaemonMcpPorts({
    appVersion: resolveDaemonVersion(),
    eventPublisher,
    configPresenter,
    configDir: paths.getConfigDir(),
    sessionRepository,
    db,
  });
  const mcpRuntime = new DaemonMcpRuntime(configPresenter, mcpPorts);
  void mcpRuntime
    .startEnabledServers()
    .then(({ started, failed }) => {
      logger.info(`[daemon] MCP startup complete: ${started.length} started, ${failed.length} failed`);
    })
    .catch((error) => {
      logger.error("[daemon] MCP startup failed before server initialization", error);
    });
  const skillRuntime = new DaemonSkillRuntime({
    dataDir: paths.getDataDir(),
    appVersion: resolveDaemonVersion(),
    eventPublisher,
    configPresenter,
    sessionRepository,
  });
  const syncRuntime = new DaemonSyncRuntime({
    configDir: paths.getConfigDir(),
    eventPublisher,
    configPresenter,
  });
  const scheduledTasks = new DaemonScheduledTasks({
    configPresenter,
    eventPublisher,
    sessionRepository,
    providerExecutionPort,
  });
  scheduledTasks.start();
  const memoryRuntime = new DaemonMemoryRuntime({
    db,
    configPresenter,
    dataDir: paths.getDataDir(),
  });
  const remoteControlRuntime = new DaemonRemoteControlRuntime({
    configPresenter,
    sessionRepository,
    providerExecutionPort,
    dataDir: paths.getDataDir(),
  });
  const pluginPresenter = new DaemonPluginPresenter({
    configPresenter,
    mcpPresenter: mcpRuntime,
    skillPresenter: skillRuntime.presenter,
    configDir: paths.getConfigDir(),
    dataDir: paths.getDataDir(),
    appVersion: resolveDaemonVersion(),
  });
  await pluginPresenter.initialize();
  await remoteControlRuntime.initialize();
  const providerImportService = new ProviderImportService(configPresenter as any, {
    sqliteReader: (dbPath) => {
      const { Database } = require("bun:sqlite");
      return new Database(dbPath, { readonly: true });
    },
  });

  const dispatcher =
    options?.dispatcher ??
    createDaemonDispatcher(
      configPresenter as any,
      eventPublisher,
      sessionRepository,
      providerExecutionPort,
      acpProviderExecutionPort as any,
      mcpRuntime,
      skillRuntime,
      scheduledTasks,
      syncRuntime,
      memoryRuntime,
      remoteControlRuntime,
      pluginPresenter,
      providerImportService,
      db,
    );
  setRouteDispatcher(dispatcher);

  const host = options?.host || "127.0.0.1";
  const port = options?.port ?? 9527;

  const exposureMode: ExposureMode = isNonLoopbackHost(host) ? "network-accessible" : "local-only";
  const authConfig: AuthGateConfig = {
    exposureMode,
    desktopBootstrapSecret: options?.desktopBootstrapSecret,
    verifySession: (secret) => Promise.resolve(sessionAuthRepo.verifySession(secret)),
  };

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

      if (url.pathname.startsWith("/api/") && request.method === "OPTIONS") {
        return withCors(new Response(null, { status: 204 }));
      }

      if (webRoot && !url.pathname.startsWith("/api/")) {
        return serveStaticWeb(webRoot, url.pathname);
      }

      if (url.pathname === "/api/v1/pair" && request.method === "POST") {
        return withCors(await handlePair(request, sessionAuthRepo));
      }

      const authResult = await authorize(request, authConfig);
      if (!authResult.ok) {
        return withCors(
          Response.json(
            { ok: false, error: { code: authResult.code, message: authResult.message } },
            { status: authResult.status },
          ),
        );
      }

      const pluginSettingsMatch = url.pathname.match(/^\/api\/v1\/plugins\/([^/]+)\/settings(?:\/(.*))?$/);
      if (pluginSettingsMatch && request.method === "GET") {
        try {
          const pluginId = decodeURIComponent(pluginSettingsMatch[1]);
          const assetPath = decodeURIComponent(pluginSettingsMatch[2] ?? "");
          return withCors(await servePluginSettingsAsset(pluginPresenter, pluginId, assetPath));
        } catch {
          return withCors(
            Response.json(
              { ok: false, error: { code: "bad_request", message: "Invalid plugin settings path" } },
              { status: 400 },
            ),
          );
        }
      }

      if (url.pathname === "/api/v1/route" && request.method === "POST") {
        return withCors(await handleRouteDispatch(request));
      }

      if (url.pathname === "/api/v1/sessions" && request.method === "GET") {
        return withCors(await handleListSessions(sessionAuthRepo));
      }

      if (url.pathname === "/api/v1/pair/token" && request.method === "POST") {
        return withCors(await handleIssuePairingToken(sessionAuthRepo, url.origin));
      }

      if (url.pathname.startsWith("/api/v1/sessions/") && request.method === "DELETE") {
        const sessionId = url.pathname.slice("/api/v1/sessions/".length);
        return withCors(await handleRevokeSession(sessionAuthRepo, sessionId));
      }

      if (url.pathname === "/api/v1/events") {
        const success = (server as any).upgrade(request, {
          data: {
            subscriptions: new Set<string>(),
            authContext: authResult.context,
          },
        });
        if (!success) {
          return withCors(
            Response.json(
              { ok: false, error: { code: "upgrade_failed", message: "WebSocket upgrade failed" } },
              { status: 500 },
            ),
          );
        }
        return undefined as unknown as Response;
      }

      return withCors(
        Response.json({ ok: false, error: { code: "not_found", message: "Unknown route" } }, { status: 404 }),
      );
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
  if (!isNonLoopbackHost(host)) {
    const originHost = host === "::1" ? "[::1]" : host;
    pluginPresenter.setSettingsBaseUrl(`http://${originHost}:${serverPort}`);
  }
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

  setupGracefulShutdown(eventPublisher, { stop: () => (server as any).stop() }, async () => {
    try {
      scheduledTasks.stop();
    } catch {
      logger.warn("[daemon] Failed to stop scheduled tasks cleanly");
    }
    try {
      await remoteControlRuntime.destroy();
    } catch {
      logger.warn("[daemon] Failed to shut down remote-control runtime cleanly");
    }
    try {
      await pluginPresenter.shutdown();
    } catch {
      logger.warn("[daemon] Failed to shut down plugin presenter cleanly");
    }
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
      scheduledTasks.stop();
      await remoteControlRuntime.destroy();
      await pluginPresenter.shutdown();
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
  --web               Serve the web UI (uses --web-root, ./web, ../../apps/desktop/out/web, or exe-dir/web)
  --web-root <path>   Web asset directory containing index.html
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
