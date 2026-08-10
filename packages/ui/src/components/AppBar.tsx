import { useState, useEffect, useMemo, useCallback } from "react";
import { createDeviceClient } from "#api/DeviceClient";
import { createWindowClient } from "#api/WindowClient";
import { Button } from "#shadcn/components/ui/button";
import { useLanguageStore } from "#/stores/language";
import { useUpgradeStore } from "#/stores/upgrade";
import MaximizeIcon from "./icons/MaximizeIcon";
import RestoreIcon from "./icons/RestoreIcon";
import CloseIcon from "./icons/CloseIcon";
import MinimizeIcon from "./icons/MinimizeIcon";
import { isBrowserMode } from "#api/runtimeKind";

const windowClient = createWindowClient();
const deviceClient = createDeviceClient();

export default function AppBar() {
  const langStore = useLanguageStore();
  const upgrade = useUpgradeStore();

  const [isMacOS, setIsMacOS] = useState<boolean | null>(null);
  const [isWindows, setIsWindows] = useState<boolean | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isFullscreened, setIsFullscreened] = useState(false);
  const [stopListener, setStopListener] = useState<(() => void) | null>(null);

  const routeName = window.location.pathname;
  const isBrowser = isBrowserMode();

  const showUpdateButton = useMemo(
    () => !isBrowser || (routeName !== "/welcome" && upgrade.shouldShowTopbarInstallButton),
    [isBrowser, routeName, upgrade.shouldShowTopbarInstallButton],
  );

  const minimizeWindow = useCallback(() => {
    void windowClient.minimizeCurrent();
  }, []);

  const toggleMaximize = useCallback(() => {
    void windowClient.toggleMaximizeCurrent();
  }, []);

  const closeWindow = useCallback(() => {
    void windowClient.closeCurrent();
  }, []);

  const handleInstallUpdate = useCallback(async () => {
    await upgrade.handleUpdate("auto");
  }, [upgrade]);

  useEffect(() => {
    void upgrade.refreshStatus();
    deviceClient.getDeviceInfo().then((deviceInfo) => {
      setIsMacOS(deviceInfo.platform === "darwin");
      setIsWindows(deviceInfo.platform === "win32");
    });

    void windowClient.getCurrentState().then((state) => {
      setIsMaximized(state.isMaximized);
      setIsFullscreened(state.isFullScreen);
    });

    const stop = windowClient.onCurrentStateChanged((payload) => {
      setIsMaximized(payload.isMaximized);
      setIsFullscreened(payload.isFullScreen);
    });
    setStopListener(() => stop);

    return () => {
      stop?.();
    };
  }, []);

  const roundedClass = !isFullscreened && isMacOS ? "" : " rounded-t-none";

  // Windows uses the native window controls overlay (caption buttons drawn by the OS over
  // the title bar). Only draw custom in-app buttons on Linux (frameless) and browser mode.
  // Gate on platform detection completing (null = still loading) so native Windows/macOS
  // renders don't flash custom controls before getDeviceInfo() resolves.
  const showCustomWindowButtons = isMacOS === false && isWindows === false;

  return (
    <div className={`flex flex-row h-9 min-h-9 relative overflow-hidden bg-sidebar${roundedClass}`} dir={langStore.dir}>
      <div className="h-full shrink-0 w-0 flex-1 flex select-none text-center text-sm font-medium flex-row items-center justify-start window-drag-region">
        {!isFullscreened && isMacOS && <div className="shrink-0 w-20 h-full window-drag-region" />}
        {showUpdateButton && (
          <Button
            variant="default"
            size="sm"
            className={`window-no-drag-region shrink-0 h-5 rounded-full px-2 text-[10px] font-medium shadow-none${isMacOS ? " ml-2" : " ml-3"}`}
            disabled={upgrade.isRestarting}
            onClick={handleInstallUpdate}
          >
            {upgrade.isRestarting ? "Restarting..." : "Install Update"}
          </Button>
        )}
        <div className="flex-1" />

        {(showCustomWindowButtons || isBrowser) && (
          <Button
            className="window-no-drag-region shrink-0 w-12 bg-transparent shadow-none rounded-none hover:bg-card/80 text-xs font-medium text-foreground flex items-center justify-center transition-all duration-200 group"
            title="Minimize"
            onClick={minimizeWindow}
          >
            <div className="h-3! w-3!">
              <MinimizeIcon />
            </div>
          </Button>
        )}
        {(showCustomWindowButtons || isBrowser) && (
          <Button
            className="window-no-drag-region shrink-0 w-12 bg-transparent shadow-none rounded-none hover:bg-card/80 text-xs font-medium text-foreground flex items-center justify-center transition-all duration-200 group"
            title={isMaximized ? "Restore" : "Maximize"}
            onClick={toggleMaximize}
          >
            {!isMaximized && (
              <div className="h-3! w-3!">
                <MaximizeIcon />
              </div>
            )}
            {isMaximized && (
              <div className="h-3! w-3!">
                <RestoreIcon />
              </div>
            )}
          </Button>
        )}
        {(showCustomWindowButtons || isBrowser) && (
          <Button
            className="window-no-drag-region shrink-0 w-12 bg-transparent shadow-none rounded-none hover:bg-red-700/80 hover:text-white text-xs font-medium text-foreground flex items-center justify-center transition-all duration-200 group"
            title="Close"
            onClick={closeWindow}
          >
            <div className="h-3! w-3!">
              <CloseIcon />
            </div>
          </Button>
        )}
      </div>
    </div>
  );
}
