import { createFileRoute } from "@tanstack/react-router";
import SettingsOverview from "#settings/components/SettingsOverview";

export const Route = createFileRoute("/settings/overview")({
  component: SettingsOverview,
});
