import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type SidecarOptions = {
  dataDir: string;
  host?: string;
  port?: number;
  maxRetries?: number;
  healthCheckIntervalMs?: number;
  healthCheckTimeoutMs?: number;
  onStatusChange?: (status: SidecarStatus) => void;
  /**
   * Fired once the daemon has actually bound its port (not when the port is
   * merely reserved), so it is safe to connect as soon as this is called.
   */
  onPortAssigned?: (port: number) => void;
};

export type SidecarStatus = "starting" | "healthy" | "unhealthy" | "stopped" | "error";

function generateDesktopBootstrapSecret(): string {
  return randomBytes(32).toString("hex");
}

export type SidecarHandle = {
  port: number;
  status: SidecarStatus;
  stop: () => Promise<void>;
  isRunning: () => boolean;
  /**
   * Resolves once the daemon actually answers health checks: immediately when
   * already healthy, otherwise on the `healthy` status transition. Rejects if
   * the sidecar stops, errors permanently, or the timeout elapses.
   */
  whenHealthy: (timeoutMs?: number) => Promise<void>;
  /**
   * Resolves with the port once the daemon has bound its listening socket.
   * This happens before `healthy`: the daemon serves the web UI right away
   * and holds API / WebSocket requests until its backend is initialized, so
   * clients can connect at this point without ever seeing ECONNREFUSED.
   */
  whenListening: (timeoutMs?: number) => Promise<number>;
};

type ListeningWaiter = {
  resolve: (port: number) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
};

type HealthyWaiter = {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
};

function findDaemonExecutable(): string {
  const platform = process.platform;
  const ext = platform === "win32" ? ".exe" : "";

  const sourceCandidateSuffixes = [join("apps", "daemon", "src", "index.ts"), join("daemon", "src", "index.ts")];

  for (const seed of [process.cwd(), process.resourcesPath]) {
    if (!seed) continue;

    let current = seed;
    const visited = new Set<string>();
    while (!visited.has(current)) {
      visited.add(current);

      for (const suffix of sourceCandidateSuffixes) {
        const candidate = join(current, suffix);
        if (existsSync(candidate)) {
          return candidate;
        }
      }

      const parent = dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  }

  const resourcesPath = process.resourcesPath || join(process.cwd(), "resources");
  const bundledPath = join(resourcesPath, "daemon", `argos-daemon${ext}`);
  if (existsSync(bundledPath)) {
    return bundledPath;
  }

  const repoDaemonDistCandidates = [
    join(process.cwd(), "apps", "daemon", "dist", `argos-daemon${ext}`), // cwd = repo root
    join(process.cwd(), "..", "daemon", "dist", `argos-daemon${ext}`), // cwd = apps/desktop
  ];
  const repoDaemonDist = repoDaemonDistCandidates.find((candidate) => existsSync(candidate));
  if (repoDaemonDist) {
    return repoDaemonDist;
  }

  // Fall back to the repo-root-shaped guess so the caller gets a stable path
  // when the workspace layout is unusual. The spawn will fail loudly if it's
  // wrong.
  return join(process.cwd(), "apps", "daemon", "src", "index.ts");
}

function findBunExecutable(): string {
  const platform = process.platform;
  const bunFileName = platform === "win32" ? "bun.exe" : "bun";
  const candidates = [
    process.env.BUN_INSTALL ? join(process.env.BUN_INSTALL, "bin", bunFileName) : null,
    process.env.USERPROFILE ? join(process.env.USERPROFILE, ".bun", "bin", bunFileName) : null,
    process.env.HOME ? join(process.env.HOME, ".bun", "bin", bunFileName) : null,
    join(homedir(), ".bun", "bin", bunFileName),
    "bun",
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (candidate === "bun" || existsSync(candidate)) {
      return candidate;
    }
  }

  return "bun";
}

function getExecutableArgs(executable: string, options: SidecarOptions, webRoot: string | null): string[] {
  const isDev = process.env.NODE_ENV === "development" || executable.endsWith(".ts");

  const base = isDev
    ? [
        executable,
        "--host",
        options.host || "127.0.0.1",
        "--port",
        String(options.port || 0),
        "--data-dir",
        options.dataDir,
      ]
    : ["--host", options.host || "127.0.0.1", "--port", String(options.port || 0), "--data-dir", options.dataDir];

  // Serve the @argos/ui build from the daemon so the desktop shell can load it
  // over http://127.0.0.1:<port>. In dev this is the built packages/ui/dist;
  // in packaged builds it is the bundled resources/web.
  if (webRoot) {
    base.push("--web", "--web-root", webRoot);
  }

  return base;
}

/**
 * Resolve the directory the daemon should serve as the web UI root.
 * Returns null when no built UI is available (e.g. dev without a UI build —
 * in that case the shell falls back to VITE_DEV_SERVER_URL).
 */
function resolveSidecarWebRoot(isDev: boolean): string | null {
  if (isDev) {
    const seeds = [process.cwd(), process.resourcesPath].filter(Boolean) as string[];
    for (const seed of seeds) {
      let current = seed;
      const visited = new Set<string>();
      while (!visited.has(current)) {
        visited.add(current);
        const candidate = join(current, "packages", "ui", "dist", "index.html");
        if (existsSync(candidate)) {
          return join(current, "packages", "ui", "dist");
        }
        const parent = dirname(current);
        if (parent === current) break;
        current = parent;
      }
    }
    return null;
  }

  // Packaged: electron-builder copies packages/ui/dist -> resources/web
  const resourcesPath = process.resourcesPath || join(process.cwd(), "resources");
  const packagedIndex = join(resourcesPath, "web", "index.html");
  return existsSync(packagedIndex) ? join(resourcesPath, "web") : null;
}

async function reserveFreePort(host: string): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = createServer();

    server.unref();
    server.once("error", reject);
    server.listen({ host, port: 0 }, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Unable to reserve daemon port"));
        return;
      }

      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }

        resolve(address.port);
      });
    });
  });
}

async function checkHealth(host: string, port: number, timeoutMs: number): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(`http://${host}:${port}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) return false;
    const body = await response.json();
    return body.status === "ok";
  } catch {
    return false;
  }
}

export async function startSidecar(options: SidecarOptions): Promise<SidecarHandle> {
  const {
    host = "127.0.0.1",
    port = 0,
    maxRetries = 3,
    healthCheckIntervalMs = 100,
    healthCheckTimeoutMs = 10000,
    onStatusChange,
    onPortAssigned,
  } = options;

  let child: ChildProcess | null = null;
  let currentPort = 0;
  let status: SidecarStatus = "starting";
  let healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  let healthProbeInFlight = false;
  let healthWatchGeneration = 0;
  let retryCount = 0;
  let stopped = false;
  let listening = false;
  const healthyWaiters = new Set<HealthyWaiter>();
  const listeningWaiters = new Set<ListeningWaiter>();

  function rejectListeningWaiters(error: Error): void {
    for (const waiter of listeningWaiters) {
      if (waiter.timer) clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    listeningWaiters.clear();
  }

  /** The daemon bound `boundPort`: publish it exactly once per process start. */
  function markListening(boundPort: number): void {
    currentPort = boundPort;
    if (listening) return;
    listening = true;
    for (const waiter of listeningWaiters) {
      if (waiter.timer) clearTimeout(waiter.timer);
      waiter.resolve(boundPort);
    }
    listeningWaiters.clear();
    onPortAssigned?.(boundPort);
  }

  function resolveHealthyWaiters(): void {
    for (const waiter of healthyWaiters) {
      if (waiter.timer) clearTimeout(waiter.timer);
      waiter.resolve();
    }
    healthyWaiters.clear();
  }

  function rejectHealthyWaiters(error: Error): void {
    for (const waiter of healthyWaiters) {
      if (waiter.timer) clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    healthyWaiters.clear();
  }

  const handle: SidecarHandle = {
    get port() {
      return currentPort;
    },
    get status() {
      return status;
    },
    async stop() {
      stopped = true;
      updateStatus("stopped");
      stopHealthWatch();

      if (child && !child.killed) {
        child.kill("SIGTERM");

        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            if (child && !child.killed) {
              child.kill("SIGKILL");
            }
            resolve();
          }, 5000);

          child!.once("exit", () => {
            clearTimeout(timeout);
            resolve();
          });
        });
      }

      child = null;
    },
    isRunning() {
      return child !== null && !child.killed && status === "healthy";
    },
    whenHealthy(timeoutMs = 30000): Promise<void> {
      if (status === "healthy") {
        return Promise.resolve();
      }

      return new Promise<void>((resolve, reject) => {
        const waiter: HealthyWaiter = { resolve, reject, timer: null };
        waiter.timer = setTimeout(() => {
          healthyWaiters.delete(waiter);
          reject(new Error(`Daemon did not become healthy within ${timeoutMs}ms`));
        }, timeoutMs);
        healthyWaiters.add(waiter);
      });
    },
    whenListening(timeoutMs = 30000): Promise<number> {
      if (listening) {
        return Promise.resolve(currentPort);
      }
      if (status === "stopped" || status === "error") {
        return Promise.reject(new Error(`Daemon ${status}`));
      }

      return new Promise<number>((resolve, reject) => {
        const waiter: ListeningWaiter = { resolve, reject, timer: null };
        waiter.timer = setTimeout(() => {
          listeningWaiters.delete(waiter);
          reject(new Error(`Daemon did not start listening within ${timeoutMs}ms`));
        }, timeoutMs);
        listeningWaiters.add(waiter);
      });
    },
  };

  // Reserved up front so the daemon can be told which port to bind. It is only
  // published (onPortAssigned / whenListening) once the daemon really listens.
  const reservedPort = port > 0 ? port : await reserveFreePort(host).catch(() => 0);
  if (reservedPort > 0) {
    currentPort = reservedPort;
  }

  function updateStatus(newStatus: SidecarStatus) {
    status = newStatus;
    if (newStatus === "healthy") {
      resolveHealthyWaiters();
    } else if (newStatus === "stopped" || newStatus === "error") {
      rejectHealthyWaiters(new Error(`Daemon ${newStatus}`));
      rejectListeningWaiters(new Error(`Daemon ${newStatus}`));
    }
    onStatusChange?.(newStatus);
  }

  function stopHealthWatch(): void {
    healthWatchGeneration++;
    if (healthCheckTimer) {
      clearInterval(healthCheckTimer);
      healthCheckTimer = null;
    }
  }

  async function probeHealth(generation: number, startedAt: number): Promise<void> {
    if (generation !== healthWatchGeneration || healthProbeInFlight) return;

    if (currentPort > 0) {
      healthProbeInFlight = true;
      let healthy = false;
      try {
        healthy = await checkHealth(host, currentPort, 2000);
      } finally {
        healthProbeInFlight = false;
      }
      if (generation !== healthWatchGeneration) return;
      if (healthy) {
        stopHealthWatch();
        // Covers daemons whose "Listening on" line was missed or never printed.
        markListening(currentPort);
        retryCount = 0;
        updateStatus("healthy");
        return;
      }
    }

    if (Date.now() - startedAt > healthCheckTimeoutMs) {
      stopHealthWatch();
      updateStatus("unhealthy");
      if (!stopped) {
        console.error("[sidecar] Health check failed:", new Error("Daemon health check timeout"));
      }
    }
  }

  /** Poll `/health` for the current process until it reports ready (or times out). */
  function startHealthWatch(): void {
    stopHealthWatch();
    const generation = healthWatchGeneration;
    const startedAt = Date.now();
    healthCheckTimer = setInterval(() => {
      void probeHealth(generation, startedAt);
    }, healthCheckIntervalMs);
  }

  async function startProcess(): Promise<void> {
    const executable = findDaemonExecutable();
    const isDev = executable.endsWith(".ts");
    const webRoot = resolveSidecarWebRoot(isDev);
    const cmd = isDev ? findBunExecutable() : executable;
    const args = isDev
      ? ["run", ...getExecutableArgs(executable, { ...options, port: reservedPort || port }, webRoot)]
      : getExecutableArgs(executable, { ...options, port: reservedPort || port }, webRoot);

    const desktopBootstrapSecret = generateDesktopBootstrapSecret();
    console.log("[sidecar] Launching daemon", {
      cmd,
      args,
      executable,
      cwd: process.cwd(),
      resourcesPath: process.resourcesPath || null,
    });

    child = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
      shell: false,
      windowsHide: true,
      env: {
        ...process.env,
        ARGOS_DESKTOP_BOOTSTRAP: desktopBootstrapSecret,
      },
    });

    listening = false;
    startHealthWatch();
    const watchGeneration = healthWatchGeneration;
    const watchStartedAt = Date.now();

    child.stdout?.on("data", (data: Buffer) => {
      const text = data.toString();
      const urlMatch = text.match(/Listening on (https?:\/\/\S+)/);
      if (urlMatch) {
        const portMatch = urlMatch[1].match(/:(\d+)(?:\/|$)/);
        if (portMatch) {
          markListening(parseInt(portMatch[1], 10));
        }
      }
      // The daemon logs right as it changes state (bound / ready), so probe
      // immediately instead of waiting for the next poll tick.
      if (status !== "healthy") {
        void probeHealth(watchGeneration, watchStartedAt);
      }
    });

    child.stderr?.on("data", (data: Buffer) => {
      console.error("[sidecar]", data.toString().trim());
    });

    child.on("exit", (code) => {
      if (stopped) return;

      console.warn(`[sidecar] Process exited with code ${code}`);
      listening = false;
      stopHealthWatch();
      updateStatus("unhealthy");

      if (retryCount < maxRetries) {
        retryCount++;
        console.log(`[sidecar] Restarting (attempt ${retryCount}/${maxRetries})...`);
        setTimeout(() => {
          if (!stopped) {
            startProcess().catch(console.error);
          }
        }, 1000 * retryCount);
      } else {
        updateStatus("error");
        console.error(`[sidecar] Max retries (${maxRetries}) exceeded`);
      }
    });

    child.on("error", (error) => {
      console.error("[sidecar] Spawn error:", error);
      stopHealthWatch();
      updateStatus("error");
    });
  }

  await startProcess();

  return handle;
}
