import { getSidecarHandle } from "@/presenter/lifecyclePresenter/hooks/init/daemonSidecarHook";
import type { SidecarHandle } from "@/presenter/sidecarManager";

type DaemonRouteEnvelope = {
  route: string;
  input: unknown;
};

type DaemonRouteErrorCode = "daemon_not_running" | "daemon_unreachable" | "native_required" | "daemon_route_failed";

export class DaemonRouteError extends Error {
  readonly code: DaemonRouteErrorCode;
  readonly route: string;
  readonly status?: number;
  readonly daemonCode?: string;

  constructor(params: {
    code: DaemonRouteErrorCode;
    route: string;
    message: string;
    status?: number;
    daemonCode?: string;
  }) {
    super(params.message);
    this.name = "DaemonRouteError";
    this.code = params.code;
    this.route = params.route;
    this.status = params.status;
    this.daemonCode = params.daemonCode;
  }
}

async function waitForDaemonHandle(route: string, timeoutMs = 30000, intervalMs = 250): Promise<SidecarHandle> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const handle = getSidecarHandle();
    if (handle && handle.port > 0) {
      return handle;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new DaemonRouteError({
    code: "daemon_not_running",
    route,
    message: "Daemon is not running",
  });
}

export async function invokeDaemonRoute<TOutput>(route: string, input: unknown): Promise<TOutput> {
  const handle = await waitForDaemonHandle(route);
  const baseUrl = `http://127.0.0.1:${handle.port}`;
  const response = await fetch(`${baseUrl}/api/v1/route`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ route, input } satisfies DaemonRouteEnvelope),
  });

  const result = (await response.json().catch(() => null)) as
    | { ok: true; output: TOutput }
    | { ok: false; error?: { code?: string; message?: string } }
    | null;

  if (!response.ok || !result || !("ok" in result) || !result.ok) {
    const daemonCode = result && "error" in result ? result.error?.code : undefined;
    const isNativeRequired = response.status === 404 || daemonCode === "unknown_route" || daemonCode === "no_contract";
    throw new DaemonRouteError({
      code: isNativeRequired ? "native_required" : "daemon_route_failed",
      route,
      status: response.status,
      daemonCode,
      message:
        (result && "error" in result && result.error?.message) ||
        (isNativeRequired
          ? `Route ${route} is native-only and is not available from the daemon`
          : `Daemon route ${route} failed (HTTP ${response.status})`),
    });
  }

  return result.output;
}
