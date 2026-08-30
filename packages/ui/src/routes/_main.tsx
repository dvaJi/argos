import { useState, useEffect, useRef, type RefObject } from "react";
import { createFileRoute, Outlet, useRouter } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { createConfigClient } from "#api/ConfigClient";
import { createOnboardingClient } from "#api/OnboardingClient";
import { createWindowClient } from "#api/WindowClient";
import { subscribeRuntimeConnectionState } from "#api/runtime";
import { SelectedTextContextMenu } from "../components/message/SelectedTextContextMenu";
import { artifactStore } from "../stores/artifact";
import { sessionStore, fetchSessions, closeSession, startNewConversation, selectSession } from "../stores/ui/session";
import { agentStore } from "../stores/ui/agent";
import { draftStore, type StartDeeplinkPayload } from "../stores/ui/draft";
import { pageRouterStore, goToNewThread, currentRoute, chatSessionId } from "../stores/ui/pageRouter";
import { toast } from "../components/use-toast";
import { SETTINGS_EVENTS } from "#/events";
import { uiSettingsStore } from "../stores/uiSettingsStore";
import TranslatePopup from "../components/popup/TranslatePopup";
import MessageDialog from "../components/ui/MessageDialog";
import McpSamplingDialog from "../components/mcp/McpSamplingDialog";
import { AddRemoteMachineDialog } from "../components/workspace/WorkspaceSelectorDialogs";
import { initAppStores, retryHydrateStores, useMcpInstallDeeplinkHandler } from "../lib/storeInitializer";
import { ensureIconsLoaded } from "../lib/iconLoader";
import AppBar from "../components/AppBar";
import WindowSideBar from "../components/WindowSideBar";
import SpotlightOverlay from "../components/spotlight/SpotlightOverlay";
import { spotlightStore } from "../stores/ui/spotlight";
import { sidepanelStore, toggleWorkspace } from "../stores/ui/sidepanel";
import { sidebarStore, toggleSidebar } from "../stores/ui/sidebar";
import { loadThreadSidebarEnabled } from "../stores/ui/threadSidebar";
import { providerStore, ensureInitialized as ensureProvidersInitialized } from "../stores/providerStore";
import { modelStore, initialize as initializeModels } from "../stores/modelStore";
import { useAppIpcRuntime } from "../composables/useAppIpcRuntime";
import { useAcpAgentUpdateNotifications } from "../composables/useAcpAgentUpdateNotifications";
import {
  clearGuidedOnboardingResumeIntent,
  GUIDED_ONBOARDING_RESUME_REQUESTED_EVENT,
  readGuidedOnboardingResumeIntent,
  type GuidedOnboardingResumeRequestDetail,
  type GuidedOnboardingResumeTrigger,
} from "../lib/onboardingResume";
import type { GuidedOnboardingStepId } from "@argos/shared-contracts/routes";
import type { DatabaseRepairSuggestedPayload } from "@argos/shared/presenter";
const DEV_WELCOME_OVERRIDE_KEY = "__argos_dev_force_welcome";
const CHAT_GUIDED_ONBOARDING_STEP_IDS = new Set<GuidedOnboardingStepId>(["switch-agent", "switch-model", "first-chat"]);
const configClient = createConfigClient();
const onboardingClient = createOnboardingClient();
const windowClient = createWindowClient();
function isDevWelcomeOverrideEnabled(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    return window.sessionStorage.getItem(DEV_WELCOME_OVERRIDE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Hides artifacts whenever the active session changes (module-scope: opaque to the React Compiler). */
function hideArtifactsForSession(_activeSessionId: string | null) {
  artifactStore.setState((s) => ({
    ...s,
    visible: false,
  }));
}

type AppIpcRuntimeOptions = Parameters<typeof useAppIpcRuntime>[0];
type MainLayoutRouter = ReturnType<typeof useRouter>;

/** Serializes error toasts so they surface one at a time. */
function useErrorToastQueue() {
  const errorQueue = useRef<
    Array<{
      id: string;
      title: string;
      message: string;
      type: string;
    }>
  >([]);
  const currentErrorId = useRef<string | null>(null);
  const errorDisplayTimer = useRef<number | null>(null);
  const displayError = function displayError(error: { id: string; title: string; message: string; type: string }) {
    currentErrorId.current = error.id;
    const handleErrorClosed = () => {
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
    };
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
      handleErrorClosed();
    }, 3000);
  };
  const showErrorToast = (error: { id: string; title: string; message: string; type: string }) => {
    const existingErrorIndex = errorQueue.current.findIndex((e) => e.id === error.id);
    if (existingErrorIndex === -1) {
      if (currentErrorId.current) {
        if (errorQueue.current.length > 5) {
          errorQueue.current.shift();
        }
        errorQueue.current.push(error);
      } else {
        displayError(error);
      }
    }
  };
  useEffect(() => {
    return () => {
      if (errorDisplayTimer.current) {
        clearTimeout(errorDisplayTimer.current);
        errorDisplayTimer.current = null;
      }
    };
  }, []);
  return { showErrorToast };
}

/** Applies a pending start deeplink once the startup route gate is open. */
function useStartDeeplinkHandlers(input: { routerInstance: MainLayoutRouter; isStartupRouteReady: boolean }) {
  const { routerInstance, isStartupRouteReady } = input;
  const processingTokenRef = useRef<number | null>(null);
  const processedTokenRef = useRef<number | null>(null);
  const activatePendingStartDeeplink = async (
    pendingStartDeeplink: StartDeeplinkPayload | null | undefined,
  ): Promise<void> => {
    if (!pendingStartDeeplink || !isStartupRouteReady) {
      return;
    }
    const token = pendingStartDeeplink.token;
    if (processingTokenRef.current === token || processedTokenRef.current === token) {
      return;
    }
    processingTokenRef.current = token;
    const clearProcessingToken = () => {
      if (processingTokenRef.current === token) {
        processingTokenRef.current = null;
      }
    };
    try {
      const initComplete = Boolean(await configClient.getSetting("init_complete"));
      if (!initComplete) {
        clearProcessingToken();
        return;
      }
      await routerInstance.load();
      if (routerInstance.state.location.pathname !== "/chat") {
        await routerInstance.navigate({
          to: "/chat",
        });
      }
      agentStore.setState((s) => ({
        ...s,
        selectedAgent: "argos",
      }));
      if (sessionStore.state.activeSessionId) {
        await closeSession();
        processedTokenRef.current = token;
        clearProcessingToken();
        return;
      }
      goToNewThread({
        refresh: true,
      });
      processedTokenRef.current = token;
      clearProcessingToken();
    } catch (error) {
      clearProcessingToken();
      throw error;
    }
  };
  const handleStartDeeplink = (_event: unknown, payload?: Omit<StartDeeplinkPayload, "token">) => {
    if (!payload?.msg) {
      return;
    }
    const nextDeeplink: StartDeeplinkPayload = {
      token: 0,
      msg: payload.msg,
      modelId: payload.modelId ?? null,
      systemPrompt: payload.systemPrompt ?? "",
      mentions: Array.isArray(payload.mentions) ? payload.mentions : [],
      autoSend: Boolean(payload.autoSend),
    };
    draftStore.setState((s) => ({
      ...s,
      pendingStartDeeplink: nextDeeplink,
    }));
    void activatePendingStartDeeplink(nextDeeplink);
  };
  return { activatePendingStartDeeplink, handleStartDeeplink };
}

/** Guided-onboarding dev trigger + resume-request handlers. */
function createGuidedOnboardingHandlers(input: { routerInstance: MainLayoutRouter }) {
  const { routerInstance } = input;
  const handleStartGuidedOnboardingDev = async () => {
    if (!import.meta.env.DEV) {
      return;
    }
    try {
      clearGuidedOnboardingResumeIntent();
      await onboardingClient.start({
        force: true,
        stepId: "select-provider",
      });
      if (routerInstance.state.location.pathname !== "/welcome") {
        await routerInstance.navigate({
          to: "/welcome",
          replace: true,
        });
      }
    } catch (error) {
      console.warn("[App] Failed to start guided onboarding from dev trigger:", error);
    }
  };
  const routeToGuidedOnboardingStep = async (stepId: GuidedOnboardingStepId | null) => {
    if (stepId && CHAT_GUIDED_ONBOARDING_STEP_IDS.has(stepId)) {
      if (routerInstance.state.location.pathname !== "/chat") {
        await routerInstance.navigate({
          to: "/chat",
          replace: true,
        });
      }
      goToNewThread({
        refresh: true,
      });
      return;
    }
    if (routerInstance.state.location.pathname !== "/welcome") {
      await routerInstance.navigate({
        to: "/welcome",
        replace: true,
      });
    }
  };
  const handleResumeGuidedOnboarding = async (trigger: GuidedOnboardingResumeTrigger) => {
    const resumeIntent = readGuidedOnboardingResumeIntent();
    if (!resumeIntent || resumeIntent.trigger !== trigger) {
      return;
    }
    try {
      const onboardingState = await onboardingClient.getState();
      if (onboardingState.status !== "active") {
        clearGuidedOnboardingResumeIntent();
        if (onboardingState.status === "completed") {
          if (routerInstance.state.location.pathname !== "/chat") {
            await routerInstance.navigate({
              to: "/chat",
              replace: true,
            });
          }
          goToNewThread({
            refresh: true,
          });
        }
        return;
      }
      clearGuidedOnboardingResumeIntent();
      await routeToGuidedOnboardingStep(onboardingState.currentStepId);
    } catch (error) {
      console.warn("[App] Failed to resume guided onboarding:", error);
    }
  };
  const handleGuidedOnboardingResumeRequested = (event: Event) => {
    const detail = (event as CustomEvent<GuidedOnboardingResumeRequestDetail>).detail;
    if (!detail?.trigger) {
      return;
    }
    void handleResumeGuidedOnboarding(detail.trigger);
  };
  return { handleStartGuidedOnboardingDev, handleResumeGuidedOnboarding, handleGuidedOnboardingResumeRequested };
}

function reportDatabaseRepairSuggested(payload: unknown) {
  const repairPayload = payload as DatabaseRepairSuggestedPayload | undefined;
  if (!repairPayload) {
    return;
  }
  toast({
    title: repairPayload.title,
    description: `${repairPayload.message} - ${repairPayload.reason}`,
  });
}

function handleZoomIn() {
  uiSettingsStore.setState((s) => ({
    ...s,
    fontSizeLevel: s.fontSizeLevel + 1,
  }));
}

function handleZoomOut() {
  uiSettingsStore.setState((s) => ({
    ...s,
    fontSizeLevel: s.fontSizeLevel - 1,
  }));
}

function handleZoomResume() {
  uiSettingsStore.setState((s) => ({
    ...s,
    fontSizeLevel: 1,
  }));
}

async function handleCreateNewConversation() {
  try {
    await startNewConversation({
      refresh: true,
    });
  } catch (error) {
    console.error("Failed to create new conversation:", error);
  }
}

/** Builds the IPC runtime handler table (module-level factory; store/module deps only). */
function createAppIpcRuntimeHandlers(input: {
  routerInstance: MainLayoutRouter;
  showErrorToast: AppIpcRuntimeOptions["showErrorToast"];
  handleStartDeeplink: AppIpcRuntimeOptions["handleStartDeeplink"];
  handleStartGuidedOnboardingDev: AppIpcRuntimeOptions["handleStartGuidedOnboardingDev"];
  handleResumeGuidedOnboarding: (trigger: GuidedOnboardingResumeTrigger) => Promise<void>;
  handleDatabaseRepairSuggested: AppIpcRuntimeOptions["handleDatabaseRepairSuggested"];
}): AppIpcRuntimeOptions {
  const { routerInstance } = input;
  return {
    handleStartDeeplink: input.handleStartDeeplink,
    handleStartGuidedOnboardingDev: input.handleStartGuidedOnboardingDev,
    handleWindowFocused: () => {
      input.handleResumeGuidedOnboarding("window-focus");
      // Re-read the thread-sidebar experiment flag: the settings window can
      // toggle it while the main window is unfocused, and the daemon emits no
      // change event for config entries.
      void loadThreadSidebarEnabled();
    },
    showErrorToast: input.showErrorToast,
    handleDatabaseRepairSuggested: input.handleDatabaseRepairSuggested,
    handleZoomIn,
    handleZoomOut,
    handleZoomResume,
    handleCreateNewConversation,
    handleToggleSidebar: () => {
      toggleSidebar();
    },
    handleToggleWorkspace: () => {
      if (currentRoute() !== "chat" || !chatSessionId()) {
        return;
      }
      toggleWorkspace(chatSessionId());
    },
    openSpotlight: () => {
      spotlightStore.setState((s) => ({
        ...s,
        isOpen: true,
      }));
    },
    handleDataResetComplete: () => {
      toast({
        title: "Data reset complete",
        description: "All data has been reset. Please restart the application.",
        variant: "default",
        duration: 15000,
      });
    },
    handleSystemNotificationClick: (msg) => {
      let sessionId: string | null = null;
      if (typeof msg === "string" && msg.startsWith("chat/")) {
        const parts = msg.split("/");
        if (parts.length === 3) {
          sessionId = parts[1];
        }
      } else if (msg && typeof msg === "object" && "threadId" in msg) {
        sessionId =
          (
            msg as {
              threadId?: string;
            }
          ).threadId ?? null;
      }
      if (sessionId) {
        void selectSession(sessionId);
      }
    },
    getCurrentRouteName: () => {
      const pathname = routerInstance.state.location.pathname;
      if (pathname === "/chat") return "chat";
      if (pathname === "/welcome") return "welcome";
      return pathname;
    },
  };
}

/** Startup route gate: bounce to /welcome until onboarding/init completes, then unlock the app. */
function useEnsureStartupWelcomeState(
  routerInstance: MainLayoutRouter,
  setIsStartupRouteReady: (ready: boolean) => void,
) {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await routerInstance.load();
        const currentRoute = routerInstance.state.location;
        const currentPath = currentRoute.pathname;
        const isWelcomeRoute = currentPath === "/welcome";
        console.info(`[App] ensureStartupWelcomeState path=${currentPath} isWelcome=${isWelcomeRoute}`);
        if (isDevWelcomeOverrideEnabled()) {
          if (!isWelcomeRoute) {
            console.info("[App] dev override → navigating to /welcome");
            await routerInstance.navigate({
              to: "/welcome",
              replace: true,
            });
          }
          if (!cancelled) setIsStartupRouteReady(true);
          return;
        }
        const initComplete = Boolean(await configClient.getSetting("init_complete"));
        let onboardingState: Awaited<ReturnType<typeof onboardingClient.getState>> | null = null;
        try {
          onboardingState = await onboardingClient.getState();
        } catch (error) {
          console.warn("[App] Failed to load onboarding state during startup:", error);
        }
        if (onboardingState?.status === "completed") {
          if (isWelcomeRoute) {
            console.info("[App] onboarding complete → navigating to /chat");
            await routerInstance.navigate({
              to: "/chat",
              replace: true,
            });
          }
          if (!cancelled) setIsStartupRouteReady(true);
          return;
        }
        if (!initComplete || onboardingState?.status === "active") {
          if (!initComplete && onboardingState?.status !== "active") {
            try {
              onboardingState = await onboardingClient.start();
            } catch (error) {
              console.warn("[App] Failed to start onboarding during startup:", error);
            }
          }
          if (!isWelcomeRoute) {
            console.info(
              `[App] initComplete=${initComplete} onboarding=${onboardingState?.status} → navigating to /welcome`,
            );
            await routerInstance.navigate({
              to: "/welcome",
              replace: true,
            });
          }
          if (!cancelled) setIsStartupRouteReady(true);
          return;
        }
        if (isWelcomeRoute) {
          console.info("[App] init complete but still on /welcome → navigating to /chat");
          await routerInstance.navigate({
            to: "/chat",
            replace: true,
          });
        }
        if (!cancelled) setIsStartupRouteReady(true);
      } catch (error) {
        if (!cancelled) setIsStartupRouteReady(true);
        throw error;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [routerInstance, setIsStartupRouteReady]);
}

/** Mount-time bootstrap: icons, stores, IPC deeplink listeners, connection recovery. */
function useAppBootstrapEffects(input: {
  guidedOnboardingResumeHandlerRef: RefObject<(event: Event) => void>;
  setupMcpDeeplinkRef: RefObject<() => () => void>;
}) {
  const { guidedOnboardingResumeHandlerRef, setupMcpDeeplinkRef } = input;
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        void windowClient.closeFloatingCurrent();
      }
    };
    const handleResumeRequested = (event: Event) => {
      guidedOnboardingResumeHandlerRef.current(event);
    };
    window.addEventListener("keydown", handleEscKey);
    window.addEventListener(GUIDED_ONBOARDING_RESUME_REQUESTED_EVENT, handleResumeRequested);
    void ensureIconsLoaded();
    void initAppStores();
    void ensureProvidersInitialized();
    void initializeModels();
    void fetchSessions();
    void loadThreadSidebarEnabled();
    const cleanupMcpDeeplinkListeners = setupMcpDeeplinkRef.current();

    // When the daemon bridge comes back after a failed startup, re-run the
    // critical store hydration so the UI actually recovers instead of staying
    // broken-but-alive.
    const unsubscribeConnection = subscribeRuntimeConnectionState((state) => {
      if (state.connected) {
        void retryHydrateStores();
      }
    });
    return () => {
      unsubscribeConnection();
      window.removeEventListener("keydown", handleEscKey);
      window.removeEventListener(GUIDED_ONBOARDING_RESUME_REQUESTED_EVENT, handleResumeRequested);
      cleanupMcpDeeplinkListeners();
    };
  }, [guidedOnboardingResumeHandlerRef, setupMcpDeeplinkRef]);
}

/** Bridges the settings window's NAVIGATE event into the in-app router. */
function useSettingsNavigateListener(routerInstance: MainLayoutRouter) {
  useEffect(() => {
    const handleSettingsNavigate = (
      _event: unknown,
      payload?: {
        routeName?: string;
        params?: Record<string, string>;
        section?: string;
      },
    ) => {
      const routeName = payload?.routeName;
      if (!routeName) return;
      const settingsPath = `/settings/${routeName.replace("settings-", "")}`;
      void routerInstance.navigate({
        to: settingsPath as any,
      });
    };
    const ipcRenderer = window?.electron?.ipcRenderer;
    if (!ipcRenderer) return;
    ipcRenderer.on(SETTINGS_EVENTS.NAVIGATE, handleSettingsNavigate);
    return () => {
      ipcRenderer.removeListener?.(SETTINGS_EVENTS.NAVIGATE, handleSettingsNavigate);
    };
  }, [routerInstance]);
}

function MainLayout() {
  const routerInstance = useRouter();
  useAcpAgentUpdateNotifications();
  const draftState = useStore(draftStore);
  const sessionState = useStore(sessionStore);
  const [isStartupRouteReady, setIsStartupRouteReady] = useState(false);
  const { showErrorToast } = useErrorToastQueue();
  const { activatePendingStartDeeplink, handleStartDeeplink } = useStartDeeplinkHandlers({
    routerInstance,
    isStartupRouteReady,
  });
  const { handleStartGuidedOnboardingDev, handleResumeGuidedOnboarding, handleGuidedOnboardingResumeRequested } =
    createGuidedOnboardingHandlers({ routerInstance });
  const { setup: setupMcpDeeplink } = useMcpInstallDeeplinkHandler();
  const appIpcHandlers = createAppIpcRuntimeHandlers({
    routerInstance,
    showErrorToast,
    handleStartDeeplink: (event, payload) => {
      handleStartDeeplink(event, payload as Omit<StartDeeplinkPayload, "token"> | undefined);
    },
    handleStartGuidedOnboardingDev,
    handleResumeGuidedOnboarding,
    handleDatabaseRepairSuggested: reportDatabaseRepairSuggested,
  });
  useAppIpcRuntime(appIpcHandlers);
  useEnsureStartupWelcomeState(routerInstance, setIsStartupRouteReady);
  const { pendingStartDeeplink } = draftState;
  useEffect(() => {
    if (!isStartupRouteReady) return;
    void activatePendingStartDeeplink(pendingStartDeeplink);
  }, [isStartupRouteReady, activatePendingStartDeeplink, pendingStartDeeplink]);
  const guidedOnboardingResumeHandlerRef = useRef(handleGuidedOnboardingResumeRequested);
  useEffect(() => {
    guidedOnboardingResumeHandlerRef.current = handleGuidedOnboardingResumeRequested;
  }, [handleGuidedOnboardingResumeRequested]);
  const setupMcpDeeplinkRef = useRef(setupMcpDeeplink);
  useEffect(() => {
    setupMcpDeeplinkRef.current = setupMcpDeeplink;
  }, [setupMcpDeeplink]);
  useAppBootstrapEffects({
    guidedOnboardingResumeHandlerRef,
    setupMcpDeeplinkRef,
  });
  const { activeSessionId } = sessionState;
  useEffect(() => {
    hideArtifactsForSession(activeSessionId);
  }, [activeSessionId]);
  useSettingsNavigateListener(routerInstance);
  return (
    <>
      <AppBar />
      <div className="flex flex-row h-0 grow relative overflow-hidden bg-sidebar" dir="ltr">
        <WindowSideBar />

        <div
          data-testid="app-main"
          className="flex min-h-0 flex-1 min-w-0 flex-col overflow-hidden rounded-tl-xl border-l border-t border-black/20 bg-background dark:border-white/10"
        >
          <div className="min-h-0 flex-1 flex flex-col relative">
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </div>
        </div>
      </div>
      <MessageDialog />
      <McpSamplingDialog />
      <AddRemoteMachineDialog />
      <SelectedTextContextMenu />
      <TranslatePopup />
      <SpotlightOverlay />
    </>
  );
}
export const Route = createFileRoute("/_main")({
  component: MainLayout,
});
