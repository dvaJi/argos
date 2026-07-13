import { createFileRoute } from "@tanstack/react-router";
import DataSettings from "#settings/components/DataSettings";

export const Route = createFileRoute("/settings/database")({
  component: DataSettings,
});
