import { createFileRoute } from "@tanstack/react-router";
import PluginsSettings from "@settings/components/PluginsSettings";

export const Route = createFileRoute("/settings/plugins")({
  component: PluginsSettings,
});
