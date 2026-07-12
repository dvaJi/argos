import { createFileRoute } from "@tanstack/react-router";
import AcpSettings from "#settings/components/AcpSettings";

export const Route = createFileRoute("/settings/acp")({
  component: AcpSettings,
});
