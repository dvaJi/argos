import { Store } from "@tanstack/store";
import { createSessionClient } from "../../../api/SessionClient";

export type PageRoute = { name: "newThread" } | { name: "chat"; sessionId: string };

type GoToNewThreadOptions = { refresh?: boolean };
type InitializePageRouterOptions = { activeSessionId?: string | null };

const sessionClient = createSessionClient();

export const pageRouterStore = new Store({
  route: { name: "newThread" } as PageRoute,
  newThreadRefreshKey: 0,
  error: null as string | null,
});

export const currentRoute = () => pageRouterStore.state.route.name;

export const chatSessionId = () =>
  pageRouterStore.state.route.name === "chat" ? pageRouterStore.state.route.sessionId : null;

export const initialize = async (options: InitializePageRouterOptions = {}): Promise<void> => {
  try {
    pageRouterStore.setState((prev) => ({ ...prev, error: null }));

    if (options.activeSessionId !== undefined) {
      pageRouterStore.setState((prev) => ({
        ...prev,
        route: options.activeSessionId ? { name: "chat", sessionId: options.activeSessionId } : { name: "newThread" },
      }));
      return;
    }

    const { session: activeAgentSession } = await sessionClient.getActive();
    if (activeAgentSession) {
      pageRouterStore.setState((prev) => ({
        ...prev,
        route: { name: "chat", sessionId: activeAgentSession.id },
      }));
      return;
    }

    pageRouterStore.setState((prev) => ({ ...prev, route: { name: "newThread" } }));
  } catch (e) {
    pageRouterStore.setState((prev) => ({
      ...prev,
      error: String(e),
      route: { name: "newThread" },
    }));
  }
};

export const goToNewThread = (options: GoToNewThreadOptions = {}): void => {
  pageRouterStore.setState((prev) => ({
    ...prev,
    route: { name: "newThread" },
    ...(options.refresh ? { newThreadRefreshKey: prev.newThreadRefreshKey + 1 } : {}),
  }));
};

export const goToChat = (sessionId: string): void => {
  pageRouterStore.setState((prev) => ({
    ...prev,
    route: { name: "chat", sessionId },
  }));
};
