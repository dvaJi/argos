import { Store, useSelector } from "@tanstack/react-store";
import { useEffect } from "react";
import { createMcpClient } from "#api/McpClient";

const mcpClient = createMcpClient();

export interface McpTaskProgressEntry {
  serverName: string;
  toolName: string;
  /** LLM tool-call id when the call came through the agent tool pipeline; lets chat blocks correlate progress. */
  toolCallId: string | null;
  /** Server-assigned task id for the task-augmented call. */
  taskId: string | null;
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
  toolCallId: string | null;
  taskId: string | null;
  status: string | null;
  statusMessage: string | null;
}) => {
  // Key by toolCallId when available (chat-block correlation) so multiple
  // concurrent calls to the same server stay separate; fall back to taskId.
  const key = payload.toolCallId ?? payload.taskId;
  if (!key) return;
  mcpTaskProgressStore.setState((prev) => ({
    tasks: {
      ...prev.tasks,
      [key]: {
        serverName: payload.serverName,
        toolName: payload.toolName,
        toolCallId: payload.toolCallId,
        taskId: payload.taskId,
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
        const { [key as string]: _removed, ...rest } = prev.tasks;
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

export function useMcpToolCallProgress(toolCallId: string | null): McpTaskProgressEntry | null {
  const tasks = useMcpTaskProgress();
  if (!toolCallId) return null;
  return tasks.find((task) => task.toolCallId === toolCallId) ?? null;
}
