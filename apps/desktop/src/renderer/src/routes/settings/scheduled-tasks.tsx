import { createFileRoute } from "@tanstack/react-router";
import ScheduledTasksSettings from "@settings/components/ScheduledTasksSettings";

export const Route = createFileRoute("/settings/scheduled-tasks")({
  component: ScheduledTasksSettings,
});
