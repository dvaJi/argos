import { useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { useStore } from "@tanstack/react-store";
import { createStartupClient } from "#api/StartupClient";
import { subscribeRuntimeConnectionState } from "#api/runtime";
import { ChatSidePanel } from "#/components/sidepanel/ChatSidePanel";
import NewThreadPage from "#/pages/NewThreadPage";
import ChatPage from "#/pages/ChatPage";
import {
  pageRouterStore,
  initialize as initializePageRouter,
  goToNewThread,
  currentRoute,
  chatSessionId,
} from "#/stores/ui/pageRouter";
import { sessionStore, applyBootstrapShell, fetchSessions } from "#/stores/ui/session";
import { agentStore, applyBootstrapAgents, fetchAgents } from "#/stores/ui/agent";
import {
  projectStore,
  applyBootstrapDefaultProjectPath,
  fetchProjects,
  loadDefaultProjectPath,
} from "#/stores/ui/project";
import { modelStore, initialize as initializeModels } from "#/stores/modelStore";
import { initialize as initializeOllama } from "#/stores/ollamaStore";
import { useStartupWorkloadStore } from "#/stores/startupWorkloadStore";
import { markStartupInteractive, scheduleStartupDeferredTask } from "#/lib/startupDeferred";

function ChatTabView() {
  const pageState = useStore(pageRouterStore);
  const sessionState = useStore(sessionStore);
  const [isReady, setIsReady] = useState(false);
  const [hydrationFailed, setHydrationFailed] = useState(false);
  const hydrationFailedRef = useRef(false);
  const cancelDeferredHydrationRef = useRef<(() => void) | null>(null);

  const startupWorkloadStore = useStartupWorkloadStore();

  useEffect(() => {
    let cancelled = false;
    let criticalLoadPromises: Promise<void> | null = null;

    const run = async () => {
      startupWorkloadStore.connect();
      console.info("[Startup][Renderer] ChatTabView critical hydration begin");

      try {
        const startupClient = createStartupClient();
        const bootstrap = await startupClient.getBootstrap();
        console.info(
          `[Startup][Renderer] startup.bootstrap.ready run=${bootstrap.startupRunId} agents=${bootstrap.agents.length} activeSession=${bootstrap.activeSessionId ?? "none"}`,
        );

        await applyBootstrapShell({
          activeSessionId: bootstrap.activeSessionId,
          activeSession: bootstrap.activeSession ?? null,
        });
        applyBootstrapAgents(bootstrap.agents);
        applyBootstrapDefaultProjectPath(bootstrap.defaultProjectPath);

        await initializePageRouter({
          activeSessionId: bootstrap.activeSessionId,
        });

        criticalLoadPromises = Promise.allSettled([
          fetchAgents(),
          fetchProjects(),
          initializeModels(),
          initializeOllama(),
        ]).then(() => {
          console.info("[Startup][Renderer] ChatTabView critical loads complete");
        }) as unknown as Promise<void>;
        hydrationFailedRef.current = false;
        setHydrationFailed(false);
      } catch (error) {
        console.warn("[Startup][Renderer] ChatTabView critical hydration failed:", error);
        hydrationFailedRef.current = true;
        setHydrationFailed(true);
        await Promise.allSettled([fetchAgents(), loadDefaultProjectPath()]);
        await initializePageRouter({
          activeSessionId: sessionStore.state.activeSessionId ?? null,
        });
      } finally {
        if (!cancelled) {
          setIsReady(true);
          console.info("[Startup][Renderer] ChatTabView interactive ready");

          if (!sessionStore.state.hasLoadedInitialPage) {
            void fetchSessions();
          }

          markStartupInteractive();
          cancelDeferredHydrationRef.current = scheduleStartupDeferredTask(async () => {
            console.info("[Startup][Renderer] ChatTabView deferred hydration begin");
            if (criticalLoadPromises) {
              await criticalLoadPromises;
            }
            console.info("[Startup][Renderer] ChatTabView deferred hydration complete");
          });
        }
      }
    };

    void run();

    // If the first hydration failed because the daemon bridge was down, re-run
    // it once the bridge comes back so the chat shell actually recovers.
    const unsubscribeConnection = subscribeRuntimeConnectionState((state) => {
      if (!cancelled && state.connected && hydrationFailedRef.current) {
        void run();
      }
    });

    return () => {
      cancelled = true;
      if (cancelDeferredHydrationRef.current) {
        cancelDeferredHydrationRef.current();
        cancelDeferredHydrationRef.current = null;
      }
      unsubscribeConnection();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const route = pageState.route;
  const sessionId = route.name === "chat" ? route.sessionId : null;

  return (
    <div className="relative flex h-full min-h-0 w-full flex-row overflow-hidden">
      <div className="relative flex h-full min-h-0 min-w-0 w-0 flex-1 transition-[width] duration-200 ease-out">
        {isReady && !hydrationFailed && (
          <>
            {route.name === "newThread" && <NewThreadPage />}
            {route.name === "chat" && sessionId && <ChatPage sessionId={sessionId} />}
          </>
        )}
        {hydrationFailed && (
          <div
            className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-3 p-6"
            role="status"
            aria-live="polite"
          >
            <Icon icon="lucide:loader-circle" className="size-5 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Reconnecting to the daemon… The app will load automatically once the connection is back.
            </p>
          </div>
        )}
      </div>

      <ChatSidePanel sessionId={sessionId} workspacePath={sessionState.bootstrapActiveSession?.projectDir ?? null} />
    </div>
  );
}

export default ChatTabView;
