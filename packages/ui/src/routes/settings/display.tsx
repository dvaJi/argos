import { createFileRoute } from "@tanstack/react-router";
import DisplaySettings from "#settings/components/DisplaySettings";

export const Route = createFileRoute("/settings/display")({
  component: DisplaySettings,
});
