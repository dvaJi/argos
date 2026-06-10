import { useCallback, useMemo, useRef, useState } from "react";
import type { DeepchatEventPayload } from "@shared/contracts/events";
import { createStartupClient } from "@api/StartupClient";

type StartupWorkloadTarget = "main" | "settings";
type StartupWorkloadTask = DeepchatEventPayload<"startup.workload.changed">["tasks"][number];
type StartupSectionId =
  | "main.bootstrap"
  | "main.sessions"
  | "main.provider"
  | "settings.providers"
  | "settings.provider"
  | "settings.ollama"
  | "settings.skills"
  | "settings.mcp"
  | "settings.remote";

const SECTION_TASK_IDS: Record<StartupSectionId, StartupWorkloadTask["id"][]> = {
  "main.bootstrap": ["main.bootstrap"],
  "main.sessions": ["main.session.firstPage"],
  "main.provider": ["main.provider.warmup"],
  "settings.providers": ["settings.providers.summary"],
  "settings.provider": ["settings.provider.models"],
  "settings.ollama": ["settings.ollama"],
  "settings.skills": ["settings.skills.catalog", "settings.skills.syncScan"],
  "settings.mcp": ["settings.mcp.runtime"],
  "settings.remote": ["settings.remote.runtime"],
};

export function useStartupWorkloadStore() {
  const startupClient = createStartupClient();
  const [runIds, setRunIds] = useState<Record<StartupWorkloadTarget, string | null>>({
    main: null,
    settings: null,
  });
  const [taskMaps, setTaskMaps] = useState<Record<StartupWorkloadTarget, Record<string, StartupWorkloadTask>>>({
    main: {},
    settings: {},
  });
  const [connected, setConnected] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const connect = useCallback(() => {
    if (connected) return;

    unsubscribeRef.current = startupClient.onWorkloadChanged((payload) => {
      setRunIds((prev) => ({
        ...prev,
        [payload.target]: payload.startupRunId,
      }));
      setTaskMaps((prev) => ({
        ...prev,
        [payload.target]: Object.fromEntries(payload.tasks.map((task) => [task.id, task])),
      }));
    });
    setConnected(true);
  }, [connected, startupClient]);

  const disconnect = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    setConnected(false);
  }, []);

  const mainTasks = useMemo(() => Object.values(taskMaps.main), [taskMaps.main]);
  const settingsTasks = useMemo(() => Object.values(taskMaps.settings), [taskMaps.settings]);

  const getTask = useCallback(
    (taskId: StartupWorkloadTask["id"]): StartupWorkloadTask | null => {
      return taskMaps.main[taskId] ?? taskMaps.settings[taskId] ?? null;
    },
    [taskMaps],
  );

  const isTaskRunning = useCallback(
    (taskId: StartupWorkloadTask["id"]): boolean => {
      return getTask(taskId)?.state === "running";
    },
    [getTask],
  );

  const isSectionReady = useCallback(
    (sectionId: StartupSectionId): boolean => {
      return SECTION_TASK_IDS[sectionId].every((taskId) => getTask(taskId)?.state === "completed");
    },
    [getTask],
  );

  return {
    runIds,
    mainTasks,
    settingsTasks,
    connected,
    connect,
    disconnect,
    getTask,
    isTaskRunning,
    isSectionReady,
  };
}
