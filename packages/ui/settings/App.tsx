import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Icon } from "@iconify/react";
import { Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { useLegacyPresenter } from "#api/legacy/presenters";
import { ArrowLeft } from "lucide-react";
import { uiSettingsStore, getFontSizeClass, loadSettings as loadUiSettings } from "../src/stores/uiSettingsStore";
import { modelCheckStore } from "../src/stores/modelCheck";
import { Button } from "#shadcn/components/ui/button";
import ModelCheckDialog from "#/components/settings/ModelCheckDialog";
import { useDeviceVersion } from "../src/composables/useDeviceVersion";
import { NOTIFICATION_EVENTS, SETTINGS_EVENTS } from "#/events";
import { toast } from "#/components/use-toast";
import { themeStore, initTheme } from "#/stores/theme";
import {
  providerStore,
  initialize as initializeProviders,
  ensureInitialized,
  updateProviderApi,
  updateProviderStatus,
  addCustomProvider,
} from "#/stores/providerStore";
import { initialize as initializeModels, refreshProviderModels } from "#/stores/modelStore";
import { ensureProviderReady as ensureOllamaProviderReady } from "#/stores/ollamaStore";
import {
  providerDeeplinkImportStore,
  openPreview as openProviderPreview,
  clearPreview as clearProviderPreview,
} from "#/stores/providerDeeplinkImport";
import { useMcpInstallDeeplinkHandler } from "../src/lib/storeInitializer";
import { ensureIconsLoaded } from "../src/lib/iconLoader";
import { useFontManager } from "../src/composables/useFontManager";
import { markStartupInteractive } from "../src/lib/startupDeferred";
import type { DatabaseRepairSuggestedPayload, LLM_PROVIDER, ProviderInstallPreview } from "@argos/shared/presenter";
import ProviderDeeplinkImportDialog from "./components/ProviderDeeplinkImportDialog";
import { nanoid } from "nanoid";
import {
  getSettingsNavigationGroups,
  getSettingsRouteItems,
  resolveSettingsNavigationPath,
  resolveTitle,
} from "@argos/shared/settingsNavigation";
import type { SettingsNavigationPayload } from "@argos/shared/settingsNavigation";
import { useStartupWorkloadStore } from "#/stores/startupWorkloadStore";
import { useStore } from "@tanstack/react-store";

const DATABASE_REPAIR_SECTION = "database-repair";
const SETTINGS_SECTION_EVENT = "argos:settings-section";
const SETTINGS_STARTUP_LOG_PREFIX = "[Startup][Settings][Renderer]";

type SettingsWindowState = Window & {
  __argosSettingsPendingSection?: string | null;
};

const SETTINGS_TAB_TEST_IDS: Record<string, string> = {
  "settings-overview": "settings-tab-overview",
  "settings-common": "settings-tab-general",
  "settings-display": "settings-tab-appearance",
  "settings-provider": "settings-tab-model-providers",
  "settings-mcp": "settings-tab-mcp",
  "settings-acp": "settings-tab-acp-agents",
};

const getSettingsTabTestId = (name: string) =>
  SETTINGS_TAB_TEST_IDS[name] ?? `settings-tab-${name.replace(/^settings-/, "")}`;

const normalizeRouteParams = (params?: Record<string, string>) =>
  Object.entries(params ?? {})
    .filter(([, value]) => typeof value === "string" && value.trim().length > 0)
    .reduce<Record<string, string>>((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});

const hasSameRouteParams = (currentParams: Record<string, unknown>, nextParams: Record<string, string>): boolean => {
  const currentEntries = Object.entries(currentParams).filter(([, value]) => typeof value === "string");
  const nextEntries = Object.entries(nextParams);

  if (currentEntries.length !== nextEntries.length) {
    return false;
  }

  return nextEntries.every(([key, value]) => currentParams[key] === value);
};

export default function SettingsApp() {
  const routerInstance = useRouter();
  const routerState = useRouterState();
  const { isMacOS, isWinMacOS } = useDeviceVersion();
  useFontManager();

  const windowPresenter = useLegacyPresenter("windowPresenter");

  const themeState = useStore(themeStore);
  const modelCheckState = useStore(modelCheckStore);
  const uiSettingsState = useStore(uiSettingsStore);
  const providerState = useStore(providerStore);
  const providerDeeplinkImportState = useStore(providerDeeplinkImportStore);
  const startupWorkloadState = useStartupWorkloadStore();

  const { setup: setupMcpDeeplink, cleanup: cleanupMcpDeeplink } = useMcpInstallDeeplinkHandler();

  const errorQueue = useRef<Array<{ id: string; title: string; message: string; type: string }>>([]);
  const currentErrorId = useRef<string | null>(null);
  const errorDisplayTimer = useRef<number | null>(null);
  const [isImportingProvider, setIsImportingProvider] = useState(false);
  const [isProcessingProviderPreview, setIsProcessingProviderPreview] = useState(false);
  const hasLoggedFirstRouteResolved = useRef(false);
  const providerStoreInitializePromise = useRef<Promise<void> | null>(null);

  const toasterTheme = useMemo(
    () => (themeState.themeMode === "system" ? (themeState.isDark ? "dark" : "light") : themeState.themeMode),
    [themeState.themeMode, themeState.isDark],
  );

  const startupTimeOrigin = typeof performance !== "undefined" ? performance.now() : Date.now();

  const logSettingsStartup = useCallback(
    (phase: string) => {
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      const elapsed = Math.round(now - startupTimeOrigin);
      console.info(`${SETTINGS_STARTUP_LOG_PREFIX} ${phase} elapsed=${elapsed}ms`);
    },
    [startupTimeOrigin],
  );

  const settings = useMemo(
    () =>
      getSettingsRouteItems(window.electron?.process?.platform).map((item) => ({
        title: item.titleKey,
        name: item.routeName,
        icon: item.icon,
        path: resolveSettingsNavigationPath(item.routeName),
      })),
    [],
  );

  const settingGroups = useMemo(
    () =>
      getSettingsNavigationGroups(window.electron?.process?.platform).map((group) => ({
        key: group.key,
        titleKey: resolveTitle(group.titleKey),
        items: group.items.map((item) => ({
          title: resolveTitle(item.titleKey),
          name: item.routeName,
          icon: item.icon,
          path: resolveSettingsNavigationPath(item.routeName),
        })),
      })),
    [],
  );

  const pendingProviderImportPreview = providerDeeplinkImportState.preview;
  const pendingProviderImportToken = providerDeeplinkImportState.previewToken;

  const providerImportConfirmDisabled = useMemo(() => {
    if (!pendingProviderImportPreview) {
      return true;
    }

    if (pendingProviderImportPreview.kind === "builtin") {
      return !providerState.providers.some((provider) => provider.id === pendingProviderImportPreview.id);
    }

    return false;
  }, [pendingProviderImportPreview, providerState.providers]);

  const isProviderStoreInitialized = () => Boolean(providerStore.state.initialized);

  const ensureProviderStoreReady = useCallback(async () => {
    if (isProviderStoreInitialized()) {
      return;
    }

    if (!providerStoreInitializePromise.current) {
      providerStoreInitializePromise.current = Promise.resolve(ensureInitialized?.() ?? initializeProviders?.())
        .then(() => {
          logSettingsStartup("providerStore ready");
        })
        .catch((error) => {
          providerStoreInitializePromise.current = null;
          throw error;
        });
    }

    await providerStoreInitializePromise.current;
  }, [logSettingsStartup]);

  const ensureProviderRouteReady = useCallback(
    async (providerId?: string) => {
      await ensureProviderStoreReady();
      if (!providerId) {
        return;
      }

      const provider = providerStore.state.providers.find((item) => item.id === providerId);
      if (!provider) {
        return;
      }

      await refreshProviderModels(providerId);

      if (provider.apiType === "ollama") {
        await ensureOllamaProviderReady(providerId);
      }
    },
    [ensureProviderStoreReady],
  );

  const navigateToProviderSettings = useCallback(
    async (providerId?: string) => {
      await routerInstance.navigate({
        to: (providerId ? `/provider/${providerId}` : "/provider") as any,
      });
    },
    [routerInstance],
  );

  const publishSettingsSection = useCallback(async (section?: string) => {
    if (!section) {
      return;
    }

    (window as SettingsWindowState).__argosSettingsPendingSection = section;
    await new Promise((resolve) => setTimeout(resolve, 0));
    window.dispatchEvent(
      new CustomEvent(SETTINGS_SECTION_EVENT, {
        detail: { section },
      }),
    );
  }, []);

  const openDatabaseRepairSection = useCallback(async () => {
    await routerInstance.navigate({ to: "/database" as any });
    await publishSettingsSection(DATABASE_REPAIR_SECTION);
  }, [routerInstance, publishSettingsSection]);

  const showDatabaseRepairSuggestedToast = useCallback((payload: DatabaseRepairSuggestedPayload) => {
    toast({
      title: payload.title,
      description: `${payload.message} - ${payload.reason}`,
    });
  }, []);

  const handleErrorClosed = useCallback(() => {
    currentErrorId.current = null;

    if (errorQueue.current.length > 0) {
      const nextError = errorQueue.current.shift();
      if (nextError) {
        displayError(nextError);
      }
    } else if (errorDisplayTimer.current) {
      clearTimeout(errorDisplayTimer.current);
      errorDisplayTimer.current = null;
    }
  }, []);

  const displayError = useCallback(
    (error: { id: string; title: string; message: string; type: string }) => {
      currentErrorId.current = error.id;

      const { dismiss } = toast({
        title: error.title,
        description: error.message,
        variant: "destructive",
        onOpenChange: (open) => {
          if (!open) {
            handleErrorClosed();
          }
        },
      });

      if (errorDisplayTimer.current) {
        clearTimeout(errorDisplayTimer.current);
      }

      errorDisplayTimer.current = window.setTimeout(() => {
        dismiss();
      }, 3000);
    },
    [handleErrorClosed],
  );

  const showErrorToast = useCallback(
    (error: { id: string; title: string; message: string; type: string }) => {
      const exists = errorQueue.current.findIndex((item) => item.id === error.id);
      if (exists !== -1) {
        return;
      }

      if (currentErrorId.current) {
        if (errorQueue.current.length > 5) {
          errorQueue.current.shift();
        }
        errorQueue.current.push(error);
        return;
      }

      displayError(error);
    },
    [displayError],
  );

  const applyProviderInstallPreview = useCallback(
    async (preview: ProviderInstallPreview) => {
      console.log(
        "Applying provider install preview in settings renderer:",
        preview.kind === "builtin" ? preview.id : preview.name,
      );

      await ensureProviderStoreReady();
      await routerInstance.load();

      if (preview.kind === "builtin") {
        await navigateToProviderSettings(preview.id);
      } else if (routerInstance.state.location.pathname !== "/provider") {
        await navigateToProviderSettings();
      }

      await new Promise((resolve) => setTimeout(resolve, 0));
      openProviderPreview(preview);
    },
    [ensureProviderStoreReady, routerInstance, navigateToProviderSettings],
  );

  const releaseProviderPreviewProcessing = useCallback(() => {
    setIsProcessingProviderPreview(false);
    if (!providerDeeplinkImportStore.state.preview) {
      void syncPendingProviderInstall();
    }
  }, []);

  const syncPendingProviderInstall = useCallback(async () => {
    if (isProcessingProviderPreview || providerDeeplinkImportStore.state.preview) {
      return;
    }

    setIsProcessingProviderPreview(true);
    let preview: ProviderInstallPreview | null = null;

    try {
      preview = await windowPresenter.consumePendingSettingsProviderInstall();
      if (!preview) {
        return;
      }

      await applyProviderInstallPreview(preview);
    } catch (error) {
      if (preview) {
        try {
          windowPresenter.setPendingSettingsProviderInstall(preview);
        } catch (requeueError) {
          console.error("Failed to requeue pending provider install preview:", requeueError);
        }
      }

      console.error("Failed to sync pending provider install preview:", error);
    } finally {
      setIsProcessingProviderPreview(false);
    }
  }, [isProcessingProviderPreview, windowPresenter, applyProviderInstallPreview]);

  const handleProviderInstall = useCallback(async () => {
    await syncPendingProviderInstall();
  }, [syncPendingProviderInstall]);

  const handleProviderImportDialogOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        clearProviderPreview();
        releaseProviderPreviewProcessing();
      }
    },
    [releaseProviderPreviewProcessing],
  );

  const confirmProviderImport = useCallback(async () => {
    const preview = providerDeeplinkImportStore.state.preview;
    if (!preview || isImportingProvider) {
      return;
    }

    setIsImportingProvider(true);

    try {
      if (preview.kind === "builtin") {
        const targetProvider = providerStore.state.providers.find((provider) => provider.id === preview.id);
        if (!targetProvider) {
          return;
        }

        await updateProviderApi(preview.id, preview.apiKey, preview.baseUrl);
        if (!targetProvider.enable) {
          await updateProviderStatus(preview.id, true);
        }

        await refreshProviderModels(preview.id);
        await navigateToProviderSettings(preview.id);
      } else {
        const providerId = nanoid();
        const newProvider: LLM_PROVIDER = {
          id: providerId,
          name: preview.name,
          apiType: preview.type,
          apiKey: preview.apiKey,
          baseUrl: preview.baseUrl,
          enable: true,
          custom: true,
        };

        await addCustomProvider(newProvider);
        await refreshProviderModels(providerId);
        await navigateToProviderSettings(providerId);
      }

      clearProviderPreview();
      releaseProviderPreviewProcessing();
    } catch (error) {
      console.error("Failed to import provider from deeplink:", error);
      toast({
        title: "Operation failed",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setIsImportingProvider(false);
    }
  }, [isImportingProvider, navigateToProviderSettings, releaseProviderPreviewProcessing]);

  const handleSettingsNavigate = useCallback(
    async (_event: unknown, payload?: SettingsNavigationPayload) => {
      const routeName = payload?.routeName;
      const params = normalizeRouteParams(payload?.params);
      if (!routeName) return;
      await routerInstance.load();
      const currentLocation = routerInstance.state.location;
      const currentRouteName = currentLocation.pathname;
      if (
        currentRouteName !== `/${routeName.replace("settings-", "")}` ||
        !hasSameRouteParams(currentLocation.search as Record<string, unknown>, params)
      ) {
        await routerInstance.navigate({
          to: `/${routeName.replace("settings-", "")}`,
          params: Object.keys(params).length > 0 ? params : undefined,
        });
      }
      if (routeName === "settings-provider") {
        await syncPendingProviderInstall();
      }

      await publishSettingsSection(payload?.section);
    },
    [routerInstance, syncPendingProviderInstall, publishSettingsSection],
  );

  const handleClick = useCallback(
    (path: string) => {
      routerInstance.navigate({ to: path });
    },
    [routerInstance],
  );

  const closeWindow = useCallback(() => {
    windowPresenter.closeSettingsWindow();
    window.close();
  }, [windowPresenter]);

  const handleWindowFocus = useCallback(() => {
    void syncPendingProviderInstall();
  }, [syncPendingProviderInstall]);

  useEffect(() => {
    const navigateHandler = (_event: unknown, payload?: SettingsNavigationPayload) => {
      void handleSettingsNavigate(_event, payload);
    };
    const installHandler = () => {
      void handleProviderInstall();
    };

    const ipcRenderer = window?.electron?.ipcRenderer;
    if (!ipcRenderer) return;

    ipcRenderer.on(SETTINGS_EVENTS.NAVIGATE, navigateHandler);
    ipcRenderer.on(SETTINGS_EVENTS.PROVIDER_INSTALL, installHandler);

    return () => {
      ipcRenderer.removeListener?.(SETTINGS_EVENTS.NAVIGATE, navigateHandler);
      ipcRenderer.removeListener?.(SETTINGS_EVENTS.PROVIDER_INSTALL, installHandler);
    };
  }, [handleSettingsNavigate, handleProviderInstall]);

  useEffect(() => {
    void ensureIconsLoaded();
    logSettingsStartup("app mounted");
  }, [logSettingsStartup]);

  useEffect(() => {
    const updateTitle = () => {
      const currentPath = routerState.location.pathname;
      const routeSegment = currentPath.split("/").filter(Boolean)[0] || "";
      const currentSetting = settings.find((s) => s.name === `settings-${routeSegment}`);
      if (currentSetting) {
        document.title = `Settings - ${currentSetting.title}`;
      } else {
        document.title = "Settings";
      }
    };

    updateTitle();

    const currentPath = routerState.location.pathname;
    const routeSegment = currentPath.split("/").filter(Boolean)[0] || "";
    if (!hasLoggedFirstRouteResolved.current && routeSegment) {
      hasLoggedFirstRouteResolved.current = true;
      logSettingsStartup(`first route resolved route=${routeSegment}`);
    }

    const providerId = (routerState.location.search as any)?.providerId as string | undefined;
    if (routeSegment === "provider") {
      void ensureProviderRouteReady(providerId);
    }
  }, [
    routerState.location.pathname,
    routerState.location.search,
    settings,
    logSettingsStartup,
    ensureProviderRouteReady,
  ]);

  useEffect(() => {
    document.documentElement.dir = "ltr";
  }, []);

  useEffect(() => {
    const newClass = getFontSizeClass(uiSettingsState.fontSizeLevel);
    document.documentElement.classList.add(newClass);
    return () => {
      document.documentElement.classList.remove(newClass);
    };
  }, [uiSettingsState.fontSizeLevel]);

  useEffect(() => {
    setupMcpDeeplink();
    startupWorkloadState.connect();

    const handleShowError = (_event: unknown, error: { id: string; title: string; message: string; type: string }) => {
      showErrorToast(error);
    };
    const handleDatabaseRepairSuggested = (_event: unknown, payload: unknown) => {
      showDatabaseRepairSuggestedToast(payload as DatabaseRepairSuggestedPayload);
    };

    window.electron.ipcRenderer.on(NOTIFICATION_EVENTS.SHOW_ERROR, handleShowError);
    window.electron.ipcRenderer.on(NOTIFICATION_EVENTS.DATABASE_REPAIR_SUGGESTED, handleDatabaseRepairSuggested);

    const init = async () => {
      const [settingsLoadResult, routerReadyResult, themeResult] = await Promise.allSettled([
        loadUiSettings(),
        routerInstance.load(),
        initTheme(),
      ]);

      if (settingsLoadResult.status === "rejected") {
        console.error(
          `${SETTINGS_STARTUP_LOG_PREFIX} failed to load UI settings during startup:`,
          settingsLoadResult.reason,
        );
      }

      if (themeResult.status === "rejected") {
        console.error(`${SETTINGS_STARTUP_LOG_PREFIX} theme init failed:`, themeResult.reason);
      }

      if (routerReadyResult.status === "rejected") {
        console.error(`${SETTINGS_STARTUP_LOG_PREFIX} router ready failed during startup:`, routerReadyResult.reason);
      }

      try {
        await initializeProviders();
        logSettingsStartup("provider summaries ready");
      } catch (error) {
        console.error(`${SETTINGS_STARTUP_LOG_PREFIX} provider summaries failed:`, error);
      }

      try {
        await initializeModels();
        logSettingsStartup("enabled models ready");
      } catch (error) {
        console.error(`${SETTINGS_STARTUP_LOG_PREFIX} enabled models failed:`, error);
      }

      markStartupInteractive();
      window.addEventListener("focus", handleWindowFocus);
      await syncPendingProviderInstall();
      window.electron?.ipcRenderer?.send(SETTINGS_EVENTS.READY);
      logSettingsStartup("settings window ready IPC sent");
    };

    void init();

    return () => {
      if (errorDisplayTimer.current) {
        clearTimeout(errorDisplayTimer.current);
        errorDisplayTimer.current = null;
      }

      window.electron.ipcRenderer.removeListener?.(NOTIFICATION_EVENTS.SHOW_ERROR, handleShowError);
      window.electron.ipcRenderer.removeListener?.(
        NOTIFICATION_EVENTS.DATABASE_REPAIR_SUGGESTED,
        handleDatabaseRepairSuggested,
      );
      window.removeEventListener("focus", handleWindowFocus);
      cleanupMcpDeeplink();
    };
  }, []);

  const [modelCheckOpen, setModelCheckOpen] = useState(false);
  useEffect(() => {
    setModelCheckOpen(modelCheckState.isDialogOpen);
  }, [modelCheckState.isDialogOpen]);

  const currentPath = routerState.location.pathname;
  const currentRouteSegment = currentPath.split("/").filter(Boolean)[0] || "";

  return (
    <div data-testid="settings-page" className={`w-full h-screen flex flex-col ${isWinMacOS ? "" : "bg-background"}`}>
      <div
        className={`w-full h-9 window-drag-region shrink-0 justify-start flex flex-row relative border border-b-0 border-window-inner-border box-border rounded-t-[10px] ${
          isMacOS ? "" : "rounded-t-none"
        } ${isMacOS ? "bg-window-background" : "bg-window-background/10"}`}
      >
        <div className="absolute bottom-0 left-0 w-full h-[1px] bg-border z-10" />
        {!isMacOS && (
          <Button
            variant="ghost"
            className="window-no-drag-region shrink-0 h-9 rounded-none gap-1.5 px-3 text-muted-foreground hover:text-foreground"
            onClick={closeWindow}
          >
            <ArrowLeft className="size-4" />
            <span className="text-xs font-medium">Back to chat</span>
          </Button>
        )}
      </div>
      <div className="w-full h-0 flex-1 flex flex-row bg-background relative">
        <div className="border-x border-b border-window-inner-border rounded-b-[10px] absolute z-10 top-0 left-0 bottom-0 right-0 pointer-events-none" />
        <div
          data-testid="settings-navigation"
          className="w-60 h-full border-r border-border shrink-0 overflow-y-auto bg-muted/10"
        >
          <div className="flex flex-col gap-4 p-3">
            {settingGroups.map((group) => (
              <div key={group.key} className="flex flex-col gap-1">
                <div className="px-2 text-xs font-medium text-muted-foreground">{group.titleKey}</div>
                <div className="flex flex-col gap-1">
                  {group.items.map((setting) => (
                    <button
                      key={setting.name}
                      type="button"
                      data-testid={getSettingsTabTestId(setting.name)}
                      className={`flex w-full min-w-0 flex-row items-center gap-2 rounded-md px-2 py-2 text-start transition-colors hover:bg-accent ${
                        currentRouteSegment === setting.name.replace("settings-", "")
                          ? "bg-accent text-accent-foreground"
                          : ""
                      }`}
                      onClick={() => handleClick(setting.path)}
                    >
                      <Icon icon={setting.icon} className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 truncate text-sm font-medium">{setting.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <Outlet />
        </div>
      </div>
      <ModelCheckDialog
        open={modelCheckOpen}
        providerId={modelCheckState.currentProviderId}
        onOpenChange={(open) => {
          if (!open) modelCheckStore.setState((s) => ({ ...s, isDialogOpen: false }));
        }}
      />
      <ProviderDeeplinkImportDialog
        key={pendingProviderImportToken}
        open={Boolean(pendingProviderImportPreview)}
        preview={pendingProviderImportPreview}
        confirmDisabled={providerImportConfirmDisabled}
        submitting={isImportingProvider}
        onOpenChange={handleProviderImportDialogOpenChange}
        onConfirm={() => void confirmProviderImport()}
      />
      <Toaster theme={toasterTheme as "light" | "dark" | "system"} />
    </div>
  );
}
