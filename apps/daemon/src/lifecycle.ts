import { mkdirSync } from "node:fs";
import type { BunEventPublisher } from "./host/bun-event-publisher";
import type { BunPathResolver } from "./host/bun-paths";

export type DaemonOptions = {
  host?: string;
  port?: number;
  dataDir?: string;
  desktopBootstrap?: string;
  web?: boolean;
  webRoot?: string;
  pair?: boolean;
  logLevel?: string;
  noUpdateCheck?: boolean;
};

export function parseArgs(argv: string[]): DaemonOptions {
  const args = argv.slice(2);
  const opts: DaemonOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--host" && args[i + 1]) {
      opts.host = args[++i];
    } else if (arg === "--port" && args[i + 1]) {
      opts.port = parseInt(args[++i], 10);
    } else if (arg === "--data-dir" && args[i + 1]) {
      opts.dataDir = args[++i];
    } else if (arg === "--no-update-check") {
      opts.noUpdateCheck = true;
    } else if (arg === "--web") {
      opts.web = true;
    } else if (arg === "--web-root" && args[i + 1]) {
      opts.webRoot = args[++i];
    } else if (arg === "--pair") {
      opts.pair = true;
    } else if (arg === "--log-level" && args[i + 1]) {
      opts.logLevel = args[++i];
    }
  }

  return opts;
}

export function mergeOptions(parsed: DaemonOptions, env: Record<string, string | undefined>): DaemonOptions {
  return {
    host: parsed.host || env.ARGOS_HOST || "127.0.0.1",
    port: parsed.port ?? (parseInt(env.ARGOS_PORT || "0", 10) || 9527),
    dataDir: parsed.dataDir || env.ARGOS_DATA_DIR || undefined,
    desktopBootstrap: parsed.desktopBootstrap || env.ARGOS_DESKTOP_BOOTSTRAP || undefined,
    web: parsed.web || env.ARGOS_WEB === "1" || env.ARGOS_WEB === "true",
    webRoot: parsed.webRoot || env.ARGOS_WEB_ROOT || undefined,
    pair: parsed.pair || false,
    logLevel: parsed.logLevel || env.ARGOS_LOG_LEVEL || "info",
    noUpdateCheck: parsed.noUpdateCheck || env.ARGOS_NO_UPDATE_CHECK === "1" || env.ARGOS_NO_UPDATE_CHECK === "true",
  };
}

export function ensureDirectories(paths: BunPathResolver): void {
  const dirs = [
    paths.getDataDir(),
    paths.getConfigDir(),
    paths.getCacheDir(),
    paths.getTempDir(),
    paths.getLogsDir(),
    `${paths.getDataDir()}/data`,
  ];

  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
  }
}

export function setupGracefulShutdown(
  eventPublisher: BunEventPublisher,
  server: { stop: () => void },
  closeCallback?: () => void,
): void {
  let shutdownInProgress = false;

  function shutdown(signal: string) {
    if (shutdownInProgress) return;
    shutdownInProgress = true;

    console.log(`\n[daemon] Received ${signal}, shutting down gracefully...`);

    server.stop();

    if (closeCallback) {
      closeCallback();
    }

    console.log("[daemon] Shutdown complete.");
    process.exit(0);
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
