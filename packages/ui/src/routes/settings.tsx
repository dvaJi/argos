import { useState, useEffect, useRef, type RefObject } from "react";
import { Icon } from "@iconify/react";
import { createFileRoute, Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import { Button } from "#shadcn/components/ui/button";
import { createWindowClient } from "#api/WindowClient";
import { createDeviceClient } from "#api/DeviceClient";
import { useDeviceVersion } from "../composables/useDeviceVersion";
import { NOTIFICATION_EVENTS, SETTINGS_EVENTS } from "#/events";
import { toast } from "../components/use-toast";
import {
  providerStore,
  initialize as initializeProviders,
  ensureInitialized,
  updateProviderApi,
  updateProviderStatus,
  addCustomProvider,
} from "../stores/providerStore";
import { initialize as initializeModels, refreshProviderModels } from "../stores/modelStore";
import { ensureProviderReady as ensureOllamaProviderReady } from "../stores/ollamaStore";
import {
  providerDeeplinkImportStore,
  openPreview as openProviderPreview,
  clearPreview as clearProviderPreview,
} from "../stores/providerDeeplinkImport";
import { useMcpInstallDeeplinkHandler } from "../lib/storeInitializer";
import { ensureIconsLoaded } from "../lib/iconLoader";
import { markStartupInteractive } from "../lib/startupDeferred";
import type { LLM_PROVIDER, ProviderInstallPreview } from "@argos/shared/presenter";
import ProviderDeeplinkImportDialog from "#settings/components/ProviderDeeplinkImportDialog";
import { nanoid } from "nanoid";
import {
  getSettingsNavigationGroups,
  getSettingsRouteItems,
  resolveSettingsNavigationPath,
  resolveTitle,
} from "@argos/shared/settingsNavigation";
import type { SettingsNavigationItem, SettingsNavigationPayload } from "@argos/shared/settingsNavigation";
import { useStartupWorkloadStore } from "../stores/startupWorkloadStore";
import { ArrowLeft } from "lucide-react";
import { isBrowserMode } from "#api/runtimeKind";
const SETTINGS_SECTION_EVENT = "argos:settings-section";
const isProviderStoreInitialized = () => Boolean(providerStore.state.initialized);
const browserMode = isBrowserMode();
const BROWSER_SUPPORTED_SETTINGS = new Set<SettingsNavigationItem["routeName"]>([
  "settings-overview",
  "settings-common",
  "settings-display",
  "settings-environments",
  "settings-provider",
  "settings-argos-agents",
  "settings-acp",
  "settings-mcp",
  "settings-server",
  "settings-notifications-hooks",
  "settings-scheduled-tasks",
  "settings-skills",
  "settings-prompt",
  "settings-knowledge-base",
  "settings-database",
  "settings-shortcut",
  "settings-about",
]);
function isSettingAvailableInCurrentRuntime(routeName: SettingsNavigationItem["routeName"]): boolean {
  void routeName; // referenced when the BROWSER_SUPPORTED_SETTINGS gate below is re-enabled
  // if (!browserMode) {
  return true;
  // }

  // return BROWSER_SUPPORTED_SETTINGS.has(routeName);
}
function BrowserUnsupportedSettingsPage({ routeName }: { routeName: SettingsNavigationItem["routeName"] }) {
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-card/60 p-6">
        <div className="text-sm font-semibold text-foreground">{resolveTitle(`routes.${routeName}`)}</div>
        <p className="mt-2 text-sm text-muted-foreground">
          This settings pane still depends on the desktop runtime and is not available in daemon web mode yet.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Use the desktop app for this page, or stay in the browser-safe settings surfaces such as Overview and
          Providers.
        </p>
      </div>
    </div>
  );
}
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
/** Builds the sidebar navigation model (module-level: pure over shared settings metadata). */
function buildSettingsNavigationModel() {
  const settings = getSettingsRouteItems().flatMap((item) =>
    isSettingAvailableInCurrentRuntime(item.routeName)
      ? [
          {
            title: item.titleKey,
            name: item.routeName,
            icon: item.icon,
            path: resolveSettingsNavigationPath(item.routeName),
          },
        ]
      : [],
  );
  const settingGroups = (() => {
    const groups = getSettingsNavigationGroups().flatMap((group) => {
      const items = group.items.flatMap((item) =>
        isSettingAvailableInCurrentRuntime(item.routeName)
          ? [
              {
                title: resolveTitle(item.titleKey),
                name: item.routeName,
                icon: item.icon,
                path: resolveSettingsNavigationPath(item.routeName),
              },
            ]
          : [],
      );
      return items.length > 0
        ? [
            {
              key: group.key,
              titleKey: resolveTitle(group.titleKey),
              items,
            },
          ]
        : [];
    });
    return groups;
  })();
  return { settings, settingGroups };
}
/** Publishes a pending section for the already-mounted settings page (module-level: window-scoped). */
async function publishSettingsSection(section?: string) {
  if (!section) {
    return;
  }
  (window as SettingsWindowState).__argosSettingsPendingSection = section;
  await new Promise((resolve) => setTimeout(resolve, 0));
  window.dispatchEvent(
    new CustomEvent(SETTINGS_SECTION_EVENT, {
      detail: {
        section,
      },
    }),
  );
}
type ProviderImportControllerInput = {
  routerInstance: ReturnType<typeof useRouter>;
  windowClient: ReturnType<typeof createWindowClient>;
  startupTimeOrigin: number;
  isProcessingProviderPreview: boolean;
  setIsProcessingProviderPreview: (value: boolean) => void;
  isImportingProvider: boolean;
  setIsImportingProvider: (value: boolean) => void;
  providerStoreInitializePromiseRef: RefObject<Promise<void> | null>;
};
/** Provider deeplink-import flow: store readiness, preview application, and confirm. */
function useProviderImportController(input: ProviderImportControllerInput) {
  const {
    routerInstance,
    windowClient,
    startupTimeOrigin,
    isProcessingProviderPreview,
    setIsProcessingProviderPreview,
    isImportingProvider,
    setIsImportingProvider,
    providerStoreInitializePromiseRef,
  } = input;
  const logSettingsStartup = (phase: string) => {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const elapsed = Math.round(now - startupTimeOrigin);
    console.info(`[Startup][Settings][Renderer] ${phase} elapsed=${elapsed}ms`);
  };
  const ensureProviderStoreReady = async () => {
    if (isProviderStoreInitialized()) {
      return;
    }
    if (!providerStoreInitializePromiseRef.current) {
      providerStoreInitializePromiseRef.current = Promise.resolve(ensureInitialized?.() ?? initializeProviders?.())
        .then(() => {
          logSettingsStartup("providerStore ready");
        })
        .catch((error) => {
          providerStoreInitializePromiseRef.current = null;
          throw error;
        });
    }
    await providerStoreInitializePromiseRef.current;
  };
  const ensureProviderRouteReady = async (providerId?: string) => {
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
  };
  const navigateToProviderSettings = async (providerId?: string) => {
    console.log("Navigating to provider settings:", providerId ? `providerId=${providerId}` : "no providerId");
    await routerInstance.navigate({
      to: (providerId ? `/settings/provider/${providerId}` : "/settings/provider") as any,
    });
  };
  const applyProviderInstallPreview = async (preview: ProviderInstallPreview) => {
    console.log(
      "Applying provider install preview in settings:",
      preview.kind === "builtin" ? preview.id : preview.name,
    );
    await ensureProviderStoreReady();
    await routerInstance.load();
    if (preview.kind === "builtin") {
      await navigateToProviderSettings(preview.id);
    } else if (routerInstance.state.location.pathname !== "/settings/provider") {
      await navigateToProviderSettings();
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    openProviderPreview(preview);
  };
  const syncPendingProviderInstall = async () => {
    if (isProcessingProviderPreview || providerDeeplinkImportStore.state.preview) {
      return;
    }
    setIsProcessingProviderPreview(true);
    let preview: ProviderInstallPreview | null = null;
    try {
      preview = await windowClient.consumePendingSettingsProviderInstall();
      if (!preview) {
        setIsProcessingProviderPreview(false);
        return;
      }
      await applyProviderInstallPreview(preview);
    } catch (error) {
      if (preview) {
        try {
          await windowClient.setPendingSettingsProviderInstall(preview);
        } catch (requeueError) {
          console.error("Failed to requeue pending provider install preview:", requeueError);
        }
      }
      console.error("Failed to sync pending provider install preview:", error);
    }
    setIsProcessingProviderPreview(false);
  };
  const releaseProviderPreviewProcessing = () => {
    setIsProcessingProviderPreview(false);
    if (!providerDeeplinkImportStore.state.preview) {
      void syncPendingProviderInstall();
    }
  };
  const handleProviderInstall = async () => {
    await syncPendingProviderInstall();
  };
  const confirmProviderImport = async () => {
    const preview = providerDeeplinkImportStore.state.preview;
    if (!preview || isImportingProvider) {
      return;
    }
    setIsImportingProvider(true);
    try {
      if (preview.kind === "builtin") {
        const targetProvider = providerStore.state.providers.find((provider) => provider.id === preview.id);
        if (!targetProvider) {
          setIsImportingProvider(false);
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
    }
    setIsImportingProvider(false);
  };
  return {
    ensureProviderStoreReady,
    ensureProviderRouteReady,
    navigateToProviderSettings,
    applyProviderInstallPreview,
    syncPendingProviderInstall,
    releaseProviderPreviewProcessing,
    handleProviderInstall,
    confirmProviderImport,
  };
}
/** Settings-page navigation handlers shared by the sidebar and IPC events. */
function createSettingsNavigationHandlers(input: {
  routerInstance: ReturnType<typeof useRouter>;
  syncPendingProviderInstall: () => Promise<void>;
}) {
  const { routerInstance, syncPendingProviderInstall } = input;
  const handleSettingsNavigate = async (_event: unknown, payload?: SettingsNavigationPayload) => {
    const routeName = payload?.routeName;
    const params = normalizeRouteParams(payload?.params);
    if (!routeName) return;
    await routerInstance.load();
    const currentLocation = routerInstance.state.location;
    const currentRouteName = currentLocation.pathname;
    const targetPath = `/settings/${routeName.replace("settings-", "")}`;
    if (
      currentRouteName !== targetPath ||
      !hasSameRouteParams(currentLocation.search as Record<string, unknown>, params)
    ) {
      await routerInstance.navigate({
        to: targetPath,
        params: Object.keys(params).length > 0 ? params : undefined,
      });
    }
    if (routeName === "settings-provider") {
      await syncPendingProviderInstall();
    }
    await publishSettingsSection(payload?.section);
  };
  const handleClick = (path: string) => {
    routerInstance.navigate({
      to: `/settings${path}`,
    });
  };
  const navigateBack = () => {
    routerInstance.navigate({
      to: "/chat",
    });
  };
  return { handleSettingsNavigate, handleClick, navigateBack };
}
function SettingsLayout() {
  const routerInstance = useRouter();
  const routerState = useRouterState();
  const { isMacOS, isWinMacOS } = useDeviceVersion();
  const windowClient = createWindowClient();
  const providerState = useStore(providerStore);
  const providerDeeplinkImportState = useStore(providerDeeplinkImportStore);
  const { setup: setupMcpDeeplink } = useMcpInstallDeeplinkHandler();
  const [isImportingProvider, setIsImportingProvider] = useState(false);
  const [isProcessingProviderPreview, setIsProcessingProviderPreview] = useState(false);
  const providerStoreInitializePromise = useRef<Promise<void> | null>(null);
  const [startupTimeOrigin] = useState(() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
  const logSettingsStartup = (phase: string) => {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const elapsed = Math.round(now - startupTimeOrigin);
    console.info(`[Startup][Settings][Renderer] ${phase} elapsed=${elapsed}ms`);
  };
  const { settings, settingGroups } = buildSettingsNavigationModel();
  const pendingProviderImportPreview = providerDeeplinkImportState.preview;
  const pendingProviderImportToken = providerDeeplinkImportState.previewToken;
  const providerImportConfirmDisabled = (() => {
    if (!pendingProviderImportPreview) {
      return true;
    }
    if (pendingProviderImportPreview.kind === "builtin") {
      return !providerState.providers.some((provider) => provider.id === pendingProviderImportPreview.id);
    }
    return false;
  })();
  const providerImport = useProviderImportController({
    routerInstance,
    windowClient,
    startupTimeOrigin,
    isProcessingProviderPreview,
    setIsProcessingProviderPreview,
    isImportingProvider,
    setIsImportingProvider,
    providerStoreInitializePromiseRef: providerStoreInitializePromise,
  });
  const handleProviderImportDialogOpenChange = (open: boolean) => {
    if (!open) {
      clearProviderPreview();
      providerImport.releaseProviderPreviewProcessing();
    }
  };
  const { ensureProviderRouteReady, syncPendingProviderInstall, handleProviderInstall, confirmProviderImport } =
    providerImport;
  const { handleSettingsNavigate, handleClick, navigateBack } = createSettingsNavigationHandlers({
    routerInstance,
    syncPendingProviderInstall: providerImport.syncPendingProviderInstall,
  });
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

  // The mount effect below subscribes once; refs keep the latest callbacks
  // reachable without re-running the effect (both are unstable per render).
  const setupMcpDeeplinkRef = useRef(setupMcpDeeplink);
  useEffect(() => {
    setupMcpDeeplinkRef.current = setupMcpDeeplink;
  }, [setupMcpDeeplink]);
  const syncPendingProviderInstallRef = useRef(syncPendingProviderInstall);
  useEffect(() => {
    syncPendingProviderInstallRef.current = syncPendingProviderInstall;
  }, [syncPendingProviderInstall]);
  useEffect(() => {
    void ensureIconsLoaded();
    logSettingsStartup("settings layout mounted");
    const cleanupMcpDeeplinkListeners = setupMcpDeeplinkRef.current();
    const init = async () => {
      try {
        await initializeProviders();
        logSettingsStartup("provider summaries ready");
      } catch (error) {
        console.error("[Startup][Settings][Renderer] provider summaries failed:", error);
      }
      try {
        await initializeModels();
        logSettingsStartup("enabled models ready");
      } catch (error) {
        console.error("[Startup][Settings][Renderer] enabled models failed:", error);
      }
      markStartupInteractive();
      await syncPendingProviderInstallRef.current();
      logSettingsStartup("settings layout ready");
    };
    void init();
    return () => {
      cleanupMcpDeeplinkListeners();
    };
  }, [logSettingsStartup]);
  useEffect(() => {
    const currentPath = routerState.location.pathname;
    const routeSegment = currentPath.split("/").filter(Boolean)[1] || "";
    if (routeSegment === "provider") {
      const providerId = (routerState.location.search as any)?.providerId as string | undefined;
      void ensureProviderRouteReady(providerId);
    }
  }, [routerState.location.pathname, routerState.location.search, ensureProviderRouteReady]);
  const currentPath = routerState.location.pathname;
  const currentRouteSegment = currentPath.split("/").filter(Boolean)[1] || "";
  const currentRouteName = `settings-${currentRouteSegment || "overview"}` as SettingsNavigationItem["routeName"];
  const isCurrentRouteAvailable = isSettingAvailableInCurrentRuntime(currentRouteName);
  return (
    <div data-testid="settings-page" className={`w-full h-full flex flex-col ${isWinMacOS ? "" : "bg-background"}`}>
      <div
        className={`w-full h-9 window-drag-region shrink-0 justify-start flex flex-row relative border border-b-0 border-window-inner-border box-border rounded-t-[10px] ${isMacOS ? "" : "rounded-t-none"} ${isMacOS ? "bg-window-background" : "bg-window-background/10"}`}
      >
        <div className="absolute bottom-0 left-0 w-full h-[1px] bg-border z-10" />
        {!isMacOS && (
          <Button
            variant="ghost"
            className="window-no-drag-region shrink-0 h-9 rounded-none gap-1.5 px-3 text-muted-foreground hover:text-foreground"
            onClick={navigateBack}
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
                      className={`flex w-full min-w-0 flex-row items-center gap-2 rounded-md px-2 py-2 text-start transition-colors hover:bg-accent ${currentRouteSegment === setting.name.replace("settings-", "") ? "bg-accent text-accent-foreground" : ""}`}
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
          {isCurrentRouteAvailable ? <Outlet /> : <BrowserUnsupportedSettingsPage routeName={currentRouteName} />}
        </div>
      </div>
      <ProviderDeeplinkImportDialog
        key={pendingProviderImportToken}
        open={Boolean(pendingProviderImportPreview)}
        preview={pendingProviderImportPreview}
        confirmDisabled={providerImportConfirmDisabled}
        submitting={isImportingProvider}
        onOpenChange={handleProviderImportDialogOpenChange}
        onConfirm={() => void confirmProviderImport()}
      />
    </div>
  );
}
export const Route = createFileRoute("/settings")({
  component: SettingsLayout,
});
