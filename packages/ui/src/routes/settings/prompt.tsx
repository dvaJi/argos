import { createFileRoute } from "@tanstack/react-router";
import PromptSetting from "#settings/components/PromptSetting";

export const Route = createFileRoute("/settings/prompt")({
  component: PromptSetting,
});
