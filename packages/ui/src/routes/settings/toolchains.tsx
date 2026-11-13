import { createFileRoute } from "@tanstack/react-router";
import ToolchainsSettings from "#settings/components/ToolchainsSettings";

export const Route = createFileRoute("/settings/toolchains")({
  component: ToolchainsSettings,
});
