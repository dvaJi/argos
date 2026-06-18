import { createFileRoute } from "@tanstack/react-router";
import EnvironmentsSettings from "@settings/components/EnvironmentsSettings";

export const Route = createFileRoute("/settings/environments")({
  component: EnvironmentsSettings,
});
