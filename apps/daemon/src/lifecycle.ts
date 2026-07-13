import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { BunEventPublisher } from "./host/bun-event-publisher";
import type { BunPathResolver } from "./host/bun-paths";

export type WebRootResolution =
  | {
      ok: true;
      root: string;
      searched: string[];
    }
  | {
      ok: false;
      searched: string[];
      message: string;
    };

function hasWebIndex(root: string): boolean {
  return existsSync(join(root, "index.html"));
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths)];
}

export function resolveWebRoot(options?: {
  explicitWebRoot?: string;
  cwd?: string;
  executablePath?: string;
}): WebRootResolution {
  const cwd = options?.cwd ?? process.cwd();
  const executableDir = dirname(options?.executablePath ?? process.execPath);

  const searched = options?.explicitWebRoot
    ? [resolve(options.explicitWebRoot)]
    : uniquePaths([
        // Standalone UI build (the @argos/ui package) — dev + packaged.
        resolve(cwd, "packages/ui/dist"),
        resolve(cwd, "../packages/ui/dist"),
        resolve(cwd, "apps/ui/dist"),
        resolve(cwd, "../apps/ui/dist"),
        // Packaged desktop: web assets bundled as resources/web.
        resolve(cwd, "resources/web"),
        resolve(executableDir, "web"),
        resolve(executableDir, "../web"),
        resolve(executableDir, "resources/web"),
        resolve(executableDir, "../resources/web"),
        // Legacy desktop out/web location (transitional).
        resolve(cwd, "apps/desktop/out/web"),
        resolve(cwd, "../apps/desktop/out/web"),
        resolve(cwd, "../../apps/desktop/out/web"),
      ]);

  const root = searched.find(hasWebIndex);
  if (root) {
    return { ok: true, root, searched };
  }

  return {
    ok: false,
    searched,
    message: [
      "Web assets not found.",
      "Run `pnpm --filter @argos/ui build` or pass `--web-root <path>`.",
      `Searched: ${searched.join(", ")}`,
    ].join(" "),
  };
}

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
  closeCallback?: () => void | Promise<void>,
): void {
  let shutdownInProgress = false;

  async function shutdown(signal: string) {
    if (shutdownInProgress) return;
    shutdownInProgress = true;

    console.log(`\n[daemon] Received ${signal}, shutting down gracefully...`);

    server.stop();

    if (closeCallback) {
      await closeCallback();
    }

    console.log("[daemon] Shutdown complete.");
    process.exit(0);
  }

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}
