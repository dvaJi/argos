import { createFileRoute } from "@tanstack/react-router";
import TriggersSettings from "#settings/components/TriggersSettings";

export const Route = createFileRoute("/settings/triggers")({
  component: TriggersSettings,
});
