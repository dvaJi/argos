import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";

export type SidecarOptions = {
  dataDir: string;
  host?: string;
  port?: number;
  token?: string;
  maxRetries?: number;
  healthCheckIntervalMs?: number;
  healthCheckTimeoutMs?: number;
  onStatusChange?: (status: SidecarStatus) => void;
  onPortAssigned?: (port: number) => void;
};

export type SidecarStatus = "starting" | "healthy" | "unhealthy" | "stopped" | "error";

export type SidecarHandle = {
  port: number;
  status: SidecarStatus;
  stop: () => Promise<void>;
  isRunning: () => boolean;
};

function findDaemonExecutable(): string {
  const isDev = process.env.NODE_ENV === "development";

  if (isDev) {
    return join(process.cwd(), "apps", "daemon", "src", "index.ts");
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

  const args = [
    "--host",
    options.host || "127.0.0.1",
    "--port",
    String(options.port || 0),
    "--data-dir",
    options.dataDir,
  ];
  if (options.token) {
    args.push("--token", options.token);
  }
  return args;
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

    child = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
      shell: isDev,
    });

    child.stdout?.on("data", (data: Buffer) => {
      const line = data.toString().trim();
      if (line.includes("Listening on http://")) {
        const match = line.match(/:(\d+)/);
        if (match) {
          currentPort = parseInt(match[1], 10);
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
