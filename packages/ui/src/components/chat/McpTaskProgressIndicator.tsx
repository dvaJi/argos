import { type FC } from "react";
import { Icon } from "@iconify/react";
import { useMcpTaskProgress } from "#/stores/mcpTaskProgress";

/**
 * Compact strip showing in-flight MCP task-augmented tool calls. Rendered
 * above the composer (like the auth banner) when any task is running.
 */
const McpTaskProgressIndicator: FC = () => {
  const tasks = useMcpTaskProgress();
  if (tasks.length === 0) return null;

  return (
    <div className="mx-auto mb-2 w-full max-w-4xl space-y-1" data-testid="mcp-task-progress">
      {tasks.map((task) => (
        <div
          key={task.toolName + task.updatedAt}
          className="flex items-center gap-2 rounded-md border bg-background/60 px-3 py-1.5 text-xs"
        >
          <Icon icon="lucide:loader-circle" className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
          <span className="truncate text-muted-foreground">
            {task.toolName}
            {task.statusMessage ? ` — ${task.statusMessage}` : task.status ? ` (${task.status})` : ""}
          </span>
        </div>
      ))}
    </div>
  );
};
export default McpTaskProgressIndicator;
