import { useState, useEffect, useCallback } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#shadcn/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#shadcn/components/ui/select";
import { useUpgradeStore } from "#/stores/upgrade";
import { useLanguageStore } from "#/stores/language";
import { useThemeStore } from "#/stores/theme";
import { useToast } from "#/components/use-toast";
import { usePresenter } from "#api/presenterBridge";
import { DEV_EVENTS, SETTINGS_EVENTS } from "#/events";
import SettingsPageShell from "./control-center/SettingsPageShell";
import logoImg from "#/assets/logo.png";

export default function AboutUsSettings() {
  const { toast } = useToast();
  const themeStore = useThemeStore();
  const languageStore = useLanguageStore();
  const devicePresenter = usePresenter("devicePresenter");
  const configPresenter = usePresenter("configPresenter");
  const windowPresenter = usePresenter("windowPresenter");
  const upgrade = useUpgradeStore();

  const [appVersion, setAppVersion] = useState("");
  const [updateChannel, setUpdateChannel] = useState("stable");
  const [isDisclaimerOpen, setIsDisclaimerOpen] = useState(false);
  const showMockUpdateControls = import.meta.env.DEV;

  const formattedUpdateVersion = upgrade.updateInfo?.version
    ? upgrade.updateInfo.version.startsWith("v")
      ? upgrade.updateInfo.version
      : `v${upgrade.updateInfo.version}`
    : "";

  const openExternalLink = useCallback((url: string) => {
    if (window.api?.openExternal) {
      window.api.openExternal(url);
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }, []);

  const showUpToDateToast = useCallback(() => {
    toast({ title: "Already up to date", description: "You are running the latest version." });
  }, [toast]);

  const showUpdateErrorToast = useCallback(
    (message: string) => {
      toast({ title: "Operation failed", description: message, variant: "destructive" });
    },
    [toast],
  );

  const handlePrimaryAction = useCallback(async () => {
    if (upgrade.isChecking() || upgrade.isDownloading() || upgrade.isRestarting) return;
    if (upgrade.getUpdateState() === "available" || upgrade.isReadyToInstall()) {
      await upgrade.handleUpdate("auto");
      return;
    }
    const status = await upgrade.checkUpdate(false);
    if (status === "not-available") showUpToDateToast();
    else if (status === "error" && upgrade.updateError) showUpdateErrorToast(upgrade.updateError);
  }, [upgrade, showUpToDateToast, showUpdateErrorToast]);

  const handleExternalCheckUpdate = useCallback(async () => {
    if (upgrade.isChecking() || upgrade.isDownloading() || upgrade.isRestarting) return;
    if (upgrade.getUpdateState() === "available" || upgrade.isReadyToInstall()) return;
    await handlePrimaryAction();
  }, [upgrade, handlePrimaryAction]);

  useEffect(() => {
    const handler = () => void handleExternalCheckUpdate();
    const ipcRenderer = window.electron?.ipcRenderer;
    if (!ipcRenderer) return;

    ipcRenderer.on(SETTINGS_EVENTS.CHECK_FOR_UPDATES, handler);
    void (async () => {
      setAppVersion(await devicePresenter.getAppVersion());
      setUpdateChannel(await configPresenter.getUpdateChannel());
      await upgrade.refreshStatus();
    })();
    return () => {
      ipcRenderer.removeListener?.(SETTINGS_EVENTS.CHECK_FOR_UPDATES, handler);
    };
  }, [devicePresenter, configPresenter, upgrade, handleExternalCheckUpdate]);

  return (
    <>
      <SettingsPageShell title="About" eyebrow="System" data-testid="settings-about-page">
        <div className="flex min-h-[520px] w-full flex-col items-center justify-center gap-2">
          <img src={logoImg} className="h-10 w-10" alt="Argos" />
          <div className="flex flex-col items-center gap-2" dir={languageStore.dir}>
            <h1 className="text-2xl font-bold">Argos</h1>
            <p className="pb-4 text-xs text-muted-foreground">v{appVersion}</p>
            <p className="px-8 text-sm text-muted-foreground">An open-source, high-performance AI assistant</p>
            <div className="flex gap-2">
              <a
                className="flex items-center text-xs text-muted-foreground hover:text-primary"
                href="https://argos.thinkinai.xyz/"
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  e.preventDefault();
                  openExternalLink("https://argos.thinkinai.xyz/");
                }}
              >
                <Icon icon="lucide:globe" className="mr-1 h-3 w-3" />
                Website
              </a>
              <a
                className="flex items-center text-xs text-muted-foreground hover:text-primary"
                href="https://github.com/dvaJi/argos"
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  e.preventDefault();
                  openExternalLink("https://github.com/dvaJi/argos");
                }}
              >
                <Icon icon="lucide:github" className="mr-1 h-3 w-3" />
                GitHub
              </a>
              <a
                className="flex items-center text-xs text-muted-foreground hover:text-primary"
                href="https://github.com/dvaJi/argos/blob/dev/LICENSE"
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  e.preventDefault();
                  openExternalLink("https://github.com/dvaJi/argos/blob/dev/LICENSE");
                }}
              >
                <Icon icon="lucide:scale" className="mr-1 h-3 w-3" />
                Apache License 2.0
              </a>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-4">
            <label className="text-sm font-medium">Update channel:</label>
            <div className="min-w-32 max-w-48">
              <Select
                value={updateChannel}
                onValueChange={async (channel) => {
                  try {
                    await configPresenter.setUpdateChannel(channel);
                    setUpdateChannel(channel);
                  } catch (error) {
                    console.error("updateChannelSetError:", error);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Update Channel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stable">Stable</SelectItem>
                  <SelectItem value="beta">Beta</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {upgrade.shouldShowUpdateNotes() && (
            <div className="mt-2 w-full max-w-xl rounded-xl border border-border/80 bg-card/70 p-4 shadow-sm">
              <div className="text-sm font-medium">Version {formattedUpdateVersion} available</div>
              {upgrade.updateInfo?.releaseNotes && (
                <div
                  className="prose prose-sm dark:prose-invert mt-3 max-h-40 overflow-y-auto pr-2 text-sm text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: upgrade.updateInfo.releaseNotes }}
                />
              )}
            </div>
          )}

          {upgrade.showManualDownloadOptions() && (
            <div className="mt-2 flex w-full max-w-xl flex-col items-center gap-1">
              <p className="text-center text-xs text-muted-foreground">Auto-update failed. Please download manually.</p>
              {upgrade.updateError && (
                <p className="text-center text-xs text-muted-foreground/80">{upgrade.updateError}</p>
              )}
            </div>
          )}

          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="mb-2 text-xs"
              onClick={() => openExternalLink("https://github.com/dvaJi/argos/discussions/1226")}
            >
              <Icon icon="lucide:message-square" className="mr-1 h-3 w-3" />
              Feedback
            </Button>
            <Button variant="outline" size="sm" className="mb-2 text-xs" onClick={() => setIsDisclaimerOpen(true)}>
              <Icon icon="lucide:info" className="mr-1 h-3 w-3" />
              Disclaimer
            </Button>

            {showMockUpdateControls && !upgrade.isMockUpdate() && (
              <Button
                variant="outline"
                size="sm"
                className="mb-2 text-xs"
                onClick={async () => {
                  const status = await upgrade.mockDownloadedUpdate();
                  if (status === "error" && upgrade.updateError) showUpdateErrorToast(upgrade.updateError);
                }}
              >
                Mock Update
              </Button>
            )}
            {showMockUpdateControls && upgrade.isMockUpdate() && (
              <Button
                variant="outline"
                size="sm"
                className="mb-2 text-xs"
                onClick={async () => {
                  const status = await upgrade.clearMockUpdate();
                  if (status === "error" && upgrade.updateError) showUpdateErrorToast(upgrade.updateError);
                }}
              >
                Clear Mock Update
              </Button>
            )}
            {showMockUpdateControls && (
              <Button
                variant="outline"
                size="sm"
                className="mb-2 text-xs"
                onClick={async () => {
                  await windowPresenter.sendToAllWindows(DEV_EVENTS.START_GUIDED_ONBOARDING);
                  await windowPresenter.focusMainWindow();
                }}
              >
                Mock Onboarding
              </Button>
            )}
            {upgrade.showManualDownloadOptions() && (
              <Button
                variant="outline"
                size="sm"
                className="mb-2 text-xs"
                onClick={() => void upgrade.handleUpdate("github")}
              >
                GitHub Download
              </Button>
            )}
            {upgrade.showManualDownloadOptions() && (
              <Button
                variant="outline"
                size="sm"
                className="mb-2 text-xs"
                onClick={() => void upgrade.handleUpdate("official")}
              >
                Official Download
              </Button>
            )}
            {!upgrade.showManualDownloadOptions() && (
              <Button
                variant="outline"
                size="sm"
                className="mb-2 text-xs"
                disabled={upgrade.isChecking() || upgrade.isDownloading() || upgrade.isRestarting}
                onClick={() => void handlePrimaryAction()}
              >
                <Icon
                  icon="lucide:refresh-cw"
                  className={`mr-1 h-3 w-3 ${upgrade.isChecking() || upgrade.isDownloading() ? "animate-spin" : ""}`}
                />
                {upgrade.isDownloading()
                  ? upgrade.updateProgress
                    ? `Downloading: ${Math.round(upgrade.updateProgress.percent)}%`
                    : "Downloading"
                  : upgrade.isReadyToInstall()
                    ? upgrade.isRestarting
                      ? "Restarting"
                      : "Install Now"
                    : upgrade.getUpdateState() === "available"
                      ? "Install Update"
                      : upgrade.isChecking()
                        ? "Checking..."
                        : "Check for Updates"}
              </Button>
            )}
          </div>
        </div>
      </SettingsPageShell>

      <Dialog open={isDisclaimerOpen} onOpenChange={setIsDisclaimerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disclaimer</DialogTitle>
            <DialogDescription>
              <div
                className="prose prose-sm dark:prose-invert max-h-[300px] max-w-none overflow-y-auto"
                dangerouslySetInnerHTML={{ __html: "Please use this software responsibly." }}
              />
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setIsDisclaimerOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
