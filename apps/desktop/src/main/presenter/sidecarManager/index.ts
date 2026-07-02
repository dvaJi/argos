import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";

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
  const isDev = process.env.NODE_ENV === "development";

  if (isDev) {
    // The electron main bundle runs with cwd = apps/desktop, so the daemon source
    // at <repo-root>/apps/daemon/src/index.ts resolves incorrectly as a doubled
    // path. Try candidate roots and pick the first that exists.
    const candidates = [
      join(process.cwd(), "apps", "daemon", "src", "index.ts"), // cwd = repo root
      join(process.cwd(), "..", "daemon", "src", "index.ts"), // cwd = apps/desktop
    ];
    return candidates.find((c) => existsSync(c)) ?? candidates[0];
  }

  const platform = process.platform;
  const ext = platform === "win32" ? ".exe" : "";

  const resourcesPath = process.resourcesPath || join(process.cwd(), "resources");
  const bundledPath = join(resourcesPath, "daemon", `argos-daemon${ext}`);

  return bundledPath;
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

  function updateStatus(newStatus: SidecarStatus) {
    status = newStatus;
    onStatusChange?.(newStatus);
  }

  async function startProcess(): Promise<void> {
    const executable = findDaemonExecutable();
    const isDev = executable.endsWith(".ts");
    const cmd = isDev ? "bun" : executable;
    const args = isDev ? ["run", ...getExecutableArgs(executable, options)] : getExecutableArgs(executable, options);

    const desktopBootstrapSecret = generateDesktopBootstrapSecret();

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

  return {
    port: currentPort,
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
}
