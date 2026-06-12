import "@/assets/main.css";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  createHashHistory,
  redirect,
  RouterProvider,
} from "@tanstack/react-router";
import { getSettingsRouteItems } from "@shared/settingsNavigation";
import { preloadIcons } from "../src/lib/iconLoader";
import SettingsApp from "./App";

import SettingsOverview from "./components/SettingsOverview";
import CommonSettings from "./components/CommonSettings";
import DisplaySettings from "./components/DisplaySettings";
import EnvironmentsSettings from "./components/EnvironmentsSettings";
import ModelProviderSettings from "./components/ModelProviderSettings";
import McpSettings from "./components/McpSettings";
import DeepChatAgentsSettings from "./components/DeepChatAgentsSettings";
import AcpSettings from "./components/AcpSettings";
import RemoteSettings from "./components/RemoteSettings";
import NotificationsHooksSettings from "./components/NotificationsHooksSettings";
import ScheduledTasksSettings from "./components/ScheduledTasksSettings";
import PluginsSettings from "./components/PluginsSettings";
import SkillsSettings from "./components/skills/SkillsSettings";
import PromptSetting from "./components/PromptSetting";
import KnowledgeBaseSettings from "./components/KnowledgeBaseSettings";
import DataSettings from "./components/DataSettings";
import ShortcutSettings from "./components/ShortcutSettings";
import AboutUsSettings from "./components/AboutUsSettings";

const settingsRouteItems = getSettingsRouteItems(window.electron?.process?.platform);

const rootRoute = createRootRoute({
  component: SettingsApp,
});

import type { RouteComponent } from "@tanstack/react-router";

const componentMap: Record<string, RouteComponent> = {
  "settings-overview": SettingsOverview,
  "settings-common": CommonSettings,
  "settings-display": DisplaySettings,
  "settings-environments": EnvironmentsSettings,
  "settings-provider": ModelProviderSettings,
  "settings-mcp": McpSettings,
  "settings-deepchat-agents": DeepChatAgentsSettings,
  "settings-acp": AcpSettings,
  "settings-remote": RemoteSettings,
  "settings-notifications-hooks": NotificationsHooksSettings,
  "settings-scheduled-tasks": ScheduledTasksSettings,
  "settings-plugins": PluginsSettings,
  "settings-skills": SkillsSettings,
  "settings-prompt": PromptSetting,
  "settings-knowledge-base": KnowledgeBaseSettings,
  "settings-database": DataSettings,
  "settings-shortcut": ShortcutSettings,
  "settings-about": AboutUsSettings,
};

const settingsRoutes = settingsRouteItems
  .map((item) => {
    if (item.routeName === "settings-dashboard") {
      return createRoute({
        getParentRoute: () => rootRoute,
        path: item.path,
        beforeLoad: () => {
          throw redirect({ to: "/overview" as any });
        },
      });
    }

    const Comp = componentMap[item.routeName as string];
    if (!Comp) return null;

    if (item.path.includes(":providerId?")) {
      const providerRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: "/provider",
        component: Comp,
      });

      const providerDetailRoute = createRoute({
        getParentRoute: () => providerRoute,
        path: "$providerId",
        component: Comp,
      });

      return providerRoute.addChildren([providerDetailRoute]);
    }

    return createRoute({
      getParentRoute: () => rootRoute,
      path: item.path,
      component: Comp,
    });
  })
  .filter(Boolean);

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/overview" as any });
  },
});

const routeTree = rootRoute.addChildren([indexRoute, ...settingsRoutes] as any);

const settingsRouter = createRouter({
  routeTree,
  history: createHashHistory(),
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 300_000,
    },
  },
});

const root = createRoot(document.getElementById("app")!);
root.render(
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={settingsRouter} />
  </QueryClientProvider>,
);

setTimeout(() => {
  preloadIcons().catch((error) => {
    console.error("Failed to preload icons:", error);
  });
}, 0);
