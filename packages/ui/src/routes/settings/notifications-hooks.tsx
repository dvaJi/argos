import { createFileRoute } from "@tanstack/react-router";
import NotificationsHooksSettings from "#settings/components/NotificationsHooksSettings";

export const Route = createFileRoute("/settings/notifications-hooks")({
  component: NotificationsHooksSettings,
});
