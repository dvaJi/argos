import { loadSettings } from "#/stores/uiSettingsStore";
import { initialize as initializeProviders } from "#/stores/providerStore";
import { DEEPLINK_EVENTS } from "#/events";
import { createIpcSubscriptionScope } from "#/lib/ipcSubscription";
import { mcpStore } from "#/stores/mcp";
import { initTheme } from "#/stores/theme";
import { initWorkspaceStore } from "#/stores/ui/workspace";

// Lazy router import: breaks the circular dependency
// (storeInitializer → router → routeTree → routes → storeInitializer).
let routerInstance: (typeof import("#/router"))["router"] | null = null;
const getRouter = async () => {
  if (!routerInstance) {
    const mod = await import("#/router");
    routerInstance = mod.router;
  }
  return routerInstance;
};

export const initAppStores = async () => {
  console.info("[Startup][Renderer] initAppStores begin");

  try {
    await Promise.all([loadSettings(), initializeProviders(), initTheme()]);
    initWorkspaceStore();
    console.info("[Startup][Renderer] initAppStores critical stores ready");
  } catch (error) {
    console.warn("[Startup][Renderer] initAppStores critical stores failed:", error);
    throw error;
  }
};

let hydrateInFlight: Promise<void> | null = null;

/**
 * Re-runs the critical store hydration after the daemon bridge comes back.
 * Deduplicated so concurrent triggers (banner + reconnect subscription) run once.
 */
export const retryHydrateStores = (): Promise<void> => {
  if (hydrateInFlight) return hydrateInFlight;
  hydrateInFlight = initAppStores()
    .catch((error) => {
      console.warn("[Startup][Renderer] initAppStores retry failed:", error);
    })
    .finally(() => {
      hydrateInFlight = null;
    });
  return hydrateInFlight;
};

export const useMcpInstallDeeplinkHandler = () => {
  let cleanupIpcListeners: (() => void) | null = null;

  const navigateToMcpSettings = async () => {
    const rt = await getRouter();
    const currentRoute = rt.state.location;
    const currentPath = currentRoute.pathname;

    if (currentPath !== "/settings/mcp") {
      await (rt.navigate as any)({ to: "/settings/mcp" });
    } else {
      await (rt.navigate as any)({
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

  const setup = (): (() => void) => {
    cleanupIpcListeners?.();
    const scope = createIpcSubscriptionScope();
    const unsubscribe = scope.on(DEEPLINK_EVENTS.MCP_INSTALL, handleMcpInstall);
    cleanupIpcListeners = scope.cleanup;
    return unsubscribe;
  };

  const cleanup = () => {
    cleanupIpcListeners?.();
    cleanupIpcListeners = null;
  };

  return { setup, cleanup };
};
