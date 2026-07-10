import { ipcMain } from "electron";
import { getSidecarHandle } from "@/presenter/lifecyclePresenter/hooks/init/daemonSidecarHook";

const DAEMON_PORT_CHANNEL = "get-daemon-port";
const PAIRING_URL_CHANNEL = "generate-pairing-url";

export function registerDaemonPortHandler(): void {
  ipcMain.removeHandler(DAEMON_PORT_CHANNEL);
  ipcMain.handle(DAEMON_PORT_CHANNEL, () => {
    const handle = getSidecarHandle();
    if (handle && handle.port > 0) {
      return { port: handle.port, host: "127.0.0.1" };
    }
    return null;
  });

  ipcMain.removeHandler(PAIRING_URL_CHANNEL);
  ipcMain.handle(PAIRING_URL_CHANNEL, async () => {
    const handle = getSidecarHandle();
    if (!handle || handle.port <= 0) {
      return { ok: false, error: { code: "daemon_not_running", message: "Daemon is not running" } };
    }
    try {
      const res = await fetch(`http://127.0.0.1:${handle.port}/api/v1/pair/token`, { method: "POST" });
      return await res.json();
    } catch {
      return { ok: false, error: { code: "daemon_unreachable", message: "Failed to reach daemon" } };
    }
  });
}
