import { ipcMain } from "electron";
import { getSidecarHandle } from "@/presenter/lifecyclePresenter/hooks/init/daemonSidecarHook";

const DAEMON_PORT_CHANNEL = "get-daemon-port";

export function registerDaemonPortHandler(): void {
  ipcMain.removeHandler(DAEMON_PORT_CHANNEL);
  ipcMain.handle(DAEMON_PORT_CHANNEL, () => {
    const handle = getSidecarHandle();
    if (handle && handle.isRunning()) {
      return { port: handle.port, host: "127.0.0.1" };
    }
    return null;
  });
}
