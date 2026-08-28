import { useEffect, useRef } from "react";
import { createIpcSubscriptionScope } from "#/lib/ipcSubscription";
import { APP_RUNTIME_EVENTS, DEEPLINK_EVENTS, DEV_EVENTS, NOTIFICATION_EVENTS, SHORTCUT_EVENTS } from "#/events";

interface UseAppIpcRuntimeOptions {
  handleStartDeeplink: (event: unknown, payload?: unknown) => void;
  handleStartGuidedOnboardingDev: () => void | Promise<void>;
  handleWindowFocused: () => void | Promise<void>;
  showErrorToast: (error: { id: string; title: string; message: string; type: string }) => void;
  handleDatabaseRepairSuggested: (payload: unknown) => void;
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  handleZoomResume: () => void;
  handleCreateNewConversation: () => void | Promise<void>;
  handleToggleSidebar: () => void;
  handleToggleWorkspace: () => void;
  openSpotlight: () => void;
  handleDataResetComplete: () => void;
  handleSystemNotificationClick: (payload: unknown) => void;
  getCurrentRouteName: () => string | symbol | null | undefined;
}

export function useAppIpcRuntime(options: UseAppIpcRuntimeOptions) {
  // Subscriptions are installed once; a ref keeps the latest handlers reachable
  // without re-subscribing on every render (callers pass inline closures).
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    const opts = optionsRef.current;
    const scope = createIpcSubscriptionScope();

    scope.on(DEEPLINK_EVENTS.START, opts.handleStartDeeplink);
    scope.on(DEV_EVENTS.START_GUIDED_ONBOARDING, () => {
      void opts.handleStartGuidedOnboardingDev();
    });
    scope.on(APP_RUNTIME_EVENTS.WINDOW_FOCUSED, () => {
      void opts.handleWindowFocused();
    });
    scope.on(NOTIFICATION_EVENTS.SHOW_ERROR, (_event, error) => {
      opts.showErrorToast(error as { id: string; title: string; message: string; type: string });
    });
    scope.on(NOTIFICATION_EVENTS.DATABASE_REPAIR_SUGGESTED, (_event, payload) => {
      opts.handleDatabaseRepairSuggested(payload);
    });
    scope.on(SHORTCUT_EVENTS.ZOOM_IN, opts.handleZoomIn);
    scope.on(SHORTCUT_EVENTS.ZOOM_OUT, opts.handleZoomOut);
    scope.on(SHORTCUT_EVENTS.ZOOM_RESUME, opts.handleZoomResume);
    scope.on(SHORTCUT_EVENTS.CREATE_NEW_CONVERSATION, () => {
      if (opts.getCurrentRouteName() !== "chat") {
        return;
      }

      void opts.handleCreateNewConversation();
    });
    scope.on(SHORTCUT_EVENTS.TOGGLE_SIDEBAR, opts.handleToggleSidebar);
    scope.on(SHORTCUT_EVENTS.TOGGLE_WORKSPACE, opts.handleToggleWorkspace);
    scope.on(SHORTCUT_EVENTS.TOGGLE_SPOTLIGHT, opts.openSpotlight);
    scope.on(NOTIFICATION_EVENTS.DATA_RESET_COMPLETE_DEV, opts.handleDataResetComplete);
    scope.on(NOTIFICATION_EVENTS.SYS_NOTIFY_CLICKED, (_event, payload) => {
      opts.handleSystemNotificationClick(payload);
    });

    return () => scope.cleanup();
  }, []);
}
