import { createFileRoute } from "@tanstack/react-router";
import ServerSettings from "@settings/components/ServerSettings";

export const Route = createFileRoute("/settings/server")({
  component: ServerSettings,
});
