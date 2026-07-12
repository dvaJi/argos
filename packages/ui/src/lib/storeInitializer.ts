import { loadSettings } from "#/stores/uiSettingsStore";
import { initialize as initializeProviders } from "#/stores/providerStore";
import { DEEPLINK_EVENTS } from "#/events";
import { createIpcSubscriptionScope } from "#/lib/ipcSubscription";
import { mcpStore } from "#/stores/mcp";
import { router } from "#/router";
import { initTheme } from "#/stores/theme";
import { initWorkspaceStore } from "#/stores/ui/workspace";

export const initAppStores = async () => {
  console.info("[Startup][Renderer] initAppStores begin");

  await Promise.all([loadSettings(), initializeProviders(), initTheme()]);
  initWorkspaceStore();
  console.info("[Startup][Renderer] initAppStores critical stores ready");
};

export const useMcpInstallDeeplinkHandler = () => {
  let cleanupIpcListeners: (() => void) | null = null;

  const navigateToMcpSettings = async () => {
    const currentRoute = router.state.location;
    const currentPath = currentRoute.pathname;

    if (currentPath !== "/settings/mcp") {
      await (router.navigate as any)({ to: "/settings/mcp" });
    } else {
      await (router.navigate as any)({
        to: "/settings/mcp",
        search: (prev: Record<string, unknown>) => prev,
        replace: true,
      });
    }
  };

  const handleMcpInstall = async (_: unknown, data: Record<string, any>) => {
    const { mcpConfig } = data ?? {};
    if (!mcpConfig) return;

    const state = mcpStore.state;
    if (!state.config.mcpEnabled) {
      await mcpStore.setState((prev) => ({ ...prev, config: { ...prev.config, mcpEnabled: true } }));
    }

    await navigateToMcpSettings();

    mcpStore.setState((prev) => ({ ...prev, mcpInstallCache: mcpConfig }));
  };

  const setup = () => {
    cleanupIpcListeners?.();
    const scope = createIpcSubscriptionScope();
    scope.on(DEEPLINK_EVENTS.MCP_INSTALL, handleMcpInstall);
    cleanupIpcListeners = scope.cleanup;
  };

  const cleanup = () => {
    cleanupIpcListeners?.();
    cleanupIpcListeners = null;
  };

  return { setup, cleanup };
};
