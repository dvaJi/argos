import { mkdirSync } from "node:fs";
import type { BunEventPublisher } from "./host/bun-event-publisher";
import type { BunPathResolver } from "./host/bun-paths";

export type DaemonOptions = {
  host?: string;
  port?: number;
  dataDir?: string;
  token?: string;
  logLevel?: string;
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
    } else if (arg === "--token" && args[i + 1]) {
      opts.token = args[++i];
    } else if (arg === "--log-level" && args[i + 1]) {
      opts.logLevel = args[++i];
    }
  }

  return opts;
}

export function mergeOptions(parsed: DaemonOptions, env: Record<string, string | undefined>): DaemonOptions {
  return {
    host: parsed.host || env.ARGOS_HOST || "127.0.0.1",
    port: parsed.port || parseInt(env.ARGOS_PORT || "0", 10) || 9527,
    dataDir: parsed.dataDir || env.ARGOS_DATA_DIR || undefined,
    token: parsed.token || env.ARGOS_TOKEN || undefined,
    logLevel: parsed.logLevel || env.ARGOS_LOG_LEVEL || "info",
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

export function generateToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}
