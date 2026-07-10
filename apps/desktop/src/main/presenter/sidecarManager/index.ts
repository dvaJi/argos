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

function getExecutableArgs(executable: string, options: SidecarOptions): string[] {
  const isDev = process.env.NODE_ENV === "development" || executable.endsWith(".ts");

  if (isDev) {
    return [
      executable,
      "--host",
      options.host || "127.0.0.1",
      "--port",
      String(options.port || 0),
      "--data-dir",
      options.dataDir,
    ];
  }

  return ["--host", options.host || "127.0.0.1", "--port", String(options.port || 0), "--data-dir", options.dataDir];
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
    healthCheckIntervalMs = 500,
    healthCheckTimeoutMs = 10000,
    onStatusChange,
    onPortAssigned,
  } = options;

  let child: ChildProcess | null = null;
  let currentPort = 0;
  let status: SidecarStatus = "starting";
  let healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  let retryCount = 0;
  let stopped = false;
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

      if (healthCheckTimer) {
        clearInterval(healthCheckTimer);
        healthCheckTimer = null;
      }

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
  };

  const reservedPort = port > 0 ? port : await reserveFreePort(host).catch(() => 0);
  if (reservedPort > 0) {
    currentPort = reservedPort;
    onPortAssigned?.(currentPort);
  }

  function updateStatus(newStatus: SidecarStatus) {
    status = newStatus;
    onStatusChange?.(newStatus);
  }

  async function startProcess(): Promise<void> {
    const executable = findDaemonExecutable();
    const isDev = executable.endsWith(".ts");
    const cmd = isDev ? findBunExecutable() : executable;
    const args = isDev
      ? ["run", ...getExecutableArgs(executable, { ...options, port: reservedPort || port })]
      : getExecutableArgs(executable, { ...options, port: reservedPort || port });

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

    child.stdout?.on("data", (data: Buffer) => {
      const line = data.toString().trim();
      const urlMatch = line.match(/Listening on (https?:\/\/[^ ]+)/);
      if (urlMatch) {
        const portMatch = urlMatch[1].match(/:(\d+)(?:\/|$)/);
        if (portMatch) {
          currentPort = parseInt(portMatch[1], 10);
          onPortAssigned?.(currentPort);
        }
      }
    });

    child.stderr?.on("data", (data: Buffer) => {
      console.error("[sidecar]", data.toString().trim());
    });

    child.on("exit", (code) => {
      if (stopped) return;

      console.warn(`[sidecar] Process exited with code ${code}`);
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
      updateStatus("error");
    });
  }

  await startProcess();

  void (async () => {
    try {
      await new Promise<void>((resolve, reject) => {
        const startTime = Date.now();

        healthCheckTimer = setInterval(async () => {
          if (currentPort > 0) {
            const healthy = await checkHealth(host, currentPort, 2000);
            if (healthy) {
              clearInterval(healthCheckTimer!);
              healthCheckTimer = null;
              updateStatus("healthy");
              retryCount = 0;
              resolve();
              return;
            }
          }

          if (Date.now() - startTime > healthCheckTimeoutMs) {
            clearInterval(healthCheckTimer!);
            healthCheckTimer = null;
            updateStatus("unhealthy");
            reject(new Error("Daemon health check timeout"));
          }
        }, healthCheckIntervalMs);
      });
    } catch (error) {
      if (!stopped) {
        console.error("[sidecar] Health check failed:", error);
      }
    }
  })();

  return handle;
}
