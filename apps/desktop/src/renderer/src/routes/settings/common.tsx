import { createFileRoute } from "@tanstack/react-router";
import CommonSettings from "@settings/components/CommonSettings";

export const Route = createFileRoute("/settings/common")({
  component: CommonSettings,
});
