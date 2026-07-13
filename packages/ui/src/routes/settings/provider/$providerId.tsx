import { createFileRoute } from "@tanstack/react-router";
import ModelProviderSettings from "#settings/components/ModelProviderSettings";

export const Route = createFileRoute("/settings/provider/$providerId")({
  component: function ProviderDetail() {
    const { providerId } = Route.useParams();
    return <ModelProviderSettings providerId={providerId} />;
  },
});
