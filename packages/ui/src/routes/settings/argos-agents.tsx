import { createFileRoute } from "@tanstack/react-router";
import ArgosAgentsSettings from "#settings/components/ArgosAgentsSettings";

export const Route = createFileRoute("/settings/argos-agents")({
  component: ArgosAgentsSettings,
});
