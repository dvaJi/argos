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
  lazyRouteComponent,
} from "@tanstack/react-router";
import { getSettingsRouteItems } from "@shared/settingsNavigation";
import { preloadIcons } from "../src/lib/iconLoader";
import SettingsApp from "./App";

const settingsRouteItems = getSettingsRouteItems(window.electron?.process?.platform);

const rootRoute = createRootRoute({
  component: SettingsApp,
});

const lazyImports: Record<string, () => Promise<any>> = {
  "settings-overview": () => import("./components/SettingsOverview"),
  "settings-common": () => import("./components/CommonSettings"),
  "settings-display": () => import("./components/DisplaySettings"),
  "settings-environments": () => import("./components/EnvironmentsSettings"),
  "settings-provider": () => import("./components/ModelProviderSettings"),
  "settings-mcp": () => import("./components/McpSettings"),
  "settings-deepchat-agents": () => import("./components/DeepChatAgentsSettings"),
  "settings-acp": () => import("./components/AcpSettings"),
  "settings-remote": () => import("./components/RemoteSettings"),
  "settings-notifications-hooks": () => import("./components/NotificationsHooksSettings"),
  "settings-scheduled-tasks": () => import("./components/ScheduledTasksSettings"),
  "settings-plugins": () => import("./components/PluginsSettings"),
  "settings-skills": () => import("./components/skills/SkillsSettings"),
  "settings-prompt": () => import("./components/PromptSetting"),
  "settings-knowledge-base": () => import("./components/KnowledgeBaseSettings"),
  "settings-database": () => import("./components/DataSettings"),
  "settings-shortcut": () => import("./components/ShortcutSettings"),
  "settings-about": () => import("./components/AboutUsSettings"),
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

    const routeName = item.routeName as string;

    const lazyFn = lazyImports[routeName];
    if (!lazyFn) return null;

    if (item.path.includes(":providerId?")) {
      const providerRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: "/provider",
        component: lazyRouteComponent(lazyFn),
      });

      const providerDetailRoute = createRoute({
        getParentRoute: () => providerRoute,
        path: "$providerId",
        component: lazyRouteComponent(lazyFn),
      });

      return providerRoute.addChildren([providerDetailRoute]);
    }

    return createRoute({
      getParentRoute: () => rootRoute,
      path: item.path,
      component: lazyRouteComponent(lazyFn),
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
