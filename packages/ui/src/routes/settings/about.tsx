import { createFileRoute } from "@tanstack/react-router";
import AboutUsSettings from "#settings/components/AboutUsSettings";

export const Route = createFileRoute("/settings/about")({
  component: AboutUsSettings,
});
