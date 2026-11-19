import { Store, useSelector } from "@tanstack/react-store";
import { useEffect } from "react";
import { createMcpClient } from "#api/McpClient";

const mcpClient = createMcpClient();

export interface McpTaskProgressEntry {
  serverName: string;
  toolName: string;
  status: string | null;
  statusMessage: string | null;
  updatedAt: number;
}

type McpTaskProgressState = {
  tasks: Record<string, McpTaskProgressEntry>;
};

const mcpTaskProgressStore = new Store<McpTaskProgressState>({
  tasks: {},
});

const eventCleanups: Array<() => void> = [];

const handleProgress = (payload: {
  serverName: string;
  toolName: string;
  taskId: string | null;
  status: string | null;
  statusMessage: string | null;
}) => {
  if (!payload.taskId) return;
  const taskId: string = payload.taskId;
  mcpTaskProgressStore.setState((prev) => ({
    tasks: {
      ...prev.tasks,
      [taskId]: {
        serverName: payload.serverName,
        toolName: payload.toolName,
        status: payload.status,
        statusMessage: payload.statusMessage,
        updatedAt: Date.now(),
      },
    },
  }));
  // Terminal states remove the task after a short delay so the UI can
  // observe the completion before the row disappears.
  if (payload.status === "completed" || payload.status === "failed" || payload.status === "cancelled") {
    setTimeout(() => {
      mcpTaskProgressStore.setState((prev) => {
        const { [payload.taskId as string]: _removed, ...rest } = prev.tasks;
        return { tasks: rest };
      });
    }, 3000);
  }
};

const initMcpTaskProgress = () => {
  eventCleanups.push(mcpClient.onToolCallProgress(handleProgress));
};

const cleanupMcpTaskProgress = () => {
  while (eventCleanups.length > 0) {
    eventCleanups.pop()?.();
  }
};

export function useMcpTaskProgress(): McpTaskProgressEntry[] {
  const state = useSelector(mcpTaskProgressStore);
  useEffect(() => {
    initMcpTaskProgress();
    return cleanupMcpTaskProgress;
  }, []);
  return Object.values(state.tasks);
}
