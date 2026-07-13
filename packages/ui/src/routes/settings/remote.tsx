import { createFileRoute } from "@tanstack/react-router";
import RemoteSettings from "#settings/components/RemoteSettings";

export const Route = createFileRoute("/settings/remote")({
  component: RemoteSettings,
});
