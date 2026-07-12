import { getSidecarHandle } from "#/presenter/lifecyclePresenter/hooks/init/daemonSidecarHook";

const DEFAULT_DAEMON_PORT = 9527;

/**
 * Base URL the local daemon serves the @argos/ui build from.
 * Falls back to the default daemon port when the sidecar handle is
 * not yet available.
 */
export function getDaemonUiBase(): string {
  const port = getSidecarHandle()?.port ?? DEFAULT_DAEMON_PORT;
  return `http://127.0.0.1:${port}`;
}

/** The @argos/ui Vite dev server URL, when running in development. */
export function getDevServerBase(): string | null {
  const url = process.env["VITE_DEV_SERVER_URL"];
  return url ? url : null;
}

/**
 * Resolve a UI route to a loadable URL.
 *
 * In development (when VITE_DEV_SERVER_URL is set) this points at the
 * @argos/ui Vite dev server (HMR). In packaged builds it points at the
 * local daemon, which serves the @argos/ui static build over HTTP —
 * the desktop shell is otherwise UI-free (CodeNomad-style).
 */
export function resolveUiUrl(route: string): string {
  const devBase = getDevServerBase();
  if (devBase) {
    try {
      return new URL(route, devBase).toString();
    } catch {
      return `${devBase}${route}`;
    }
  }
  return `${getDaemonUiBase()}${route}`;
}

/**
 * Wait for the daemon sidecar to assign a port. Returns null on timeout.
 */
export async function waitForDaemonPort(timeoutMs = 30000): Promise<number | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const port = getSidecarHandle()?.port;
    if (port) return port;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return null;
}
