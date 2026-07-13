import { createFileRoute } from "@tanstack/react-router";
import ModelProviderSettings from "#settings/components/ModelProviderSettings";

export const Route = createFileRoute("/settings/provider/")({
  component: ModelProviderSettings,
});
