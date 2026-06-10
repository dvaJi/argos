import {
  createRootRoute,
  createRoute,
  createRouter,
  createHashHistory,
  redirect,
  lazyRouteComponent,
} from "@tanstack/react-router";
import App from "../App";

const rootRoute = createRootRoute({
  component: App,
});

const chatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/chat",
  component: lazyRouteComponent(() => import("@/views/ChatTabView")),
});

const welcomeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/welcome",
  component: lazyRouteComponent(() => import("@/pages/WelcomePage")),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/chat" });
  },
});

const routeTree = rootRoute.addChildren([indexRoute, chatRoute, welcomeRoute]);

export const router = createRouter({
  routeTree,
  history: createHashHistory(),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
