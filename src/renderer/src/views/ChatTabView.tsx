import { useEffect, useRef, useState } from "react";
import { useStore } from "@tanstack/react-store";
import { createStartupClient } from "@api/StartupClient";
import { ChatSidePanel } from "@/components/sidepanel/ChatSidePanel";
import NewThreadPage from "@/pages/NewThreadPage";
import ChatPage from "@/pages/ChatPage";
import { AgentWelcomePage } from "@/pages/AgentWelcomePage";
import {
  pageRouterStore,
  initialize as initializePageRouter,
  goToNewThread,
  currentRoute,
  chatSessionId,
} from "@/stores/ui/pageRouter";
import { sessionStore, applyBootstrapShell, fetchSessions } from "@/stores/ui/session";
import { agentStore, applyBootstrapAgents, fetchAgents } from "@/stores/ui/agent";
import {
  projectStore,
  applyBootstrapDefaultProjectPath,
  fetchProjects,
  loadDefaultProjectPath,
} from "@/stores/ui/project";
import { modelStore, initialize as initializeModels } from "@/stores/modelStore";
import { initialize as initializeOllama } from "@/stores/ollamaStore";
import { useStartupWorkloadStore } from "@/stores/startupWorkloadStore";
import { markStartupInteractive, scheduleStartupDeferredTask } from "@/lib/startupDeferred";

export function ChatTabView() {
  const pageState = useStore(pageRouterStore);
  const sessionState = useStore(sessionStore);
  const agentState = useStore(agentStore);
  const [isReady, setIsReady] = useState(false);
  const cancelDeferredHydrationRef = useRef<(() => void) | null>(null);

  let startupWorkloadStore: ReturnType<typeof useStartupWorkloadStore> | null = null;
  try {
    startupWorkloadStore = useStartupWorkloadStore();
  } catch {
    console.warn("[Startup][Renderer] startupWorkloadStore unavailable in ChatTabView");
  }

  useEffect(() => {
    let cancelled = false;
    let criticalLoadPromises: Promise<void> | null = null;

    const run = async () => {
      startupWorkloadStore?.connect();
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
      } catch (error) {
        console.warn("[Startup][Renderer] ChatTabView critical hydration failed:", error);
        await Promise.allSettled([fetchAgents(), loadDefaultProjectPath()]);
        await initializePageRouter({
          activeSessionId: sessionStore.state.activeSessionId ?? null,
        });
      } finally {
        if (cancelled) return;
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
    };

    void run();

    return () => {
      cancelled = true;
      if (cancelDeferredHydrationRef.current) {
        cancelDeferredHydrationRef.current();
        cancelDeferredHydrationRef.current = null;
      }
    };
  }, []);

  const route = pageState.route;
  const sessionId = route.name === "chat" ? route.sessionId : null;

  return (
    <div className="relative flex h-full min-h-0 w-full flex-row overflow-hidden">
      <div className="relative flex h-full min-h-0 min-w-0 w-0 flex-1 transition-[width] duration-200 ease-out">
        {isReady && (
          <>
            {route.name === "newThread" && agentState.selectedAgentId === null && <AgentWelcomePage />}
            {route.name === "newThread" && agentState.selectedAgentId !== null && <NewThreadPage />}
            {route.name === "chat" && sessionId && <ChatPage sessionId={sessionId} />}
          </>
        )}
      </div>

      <ChatSidePanel sessionId={sessionId} workspacePath={sessionState.bootstrapActiveSession?.projectDir ?? null} />
    </div>
  );
}

export default ChatTabView;
