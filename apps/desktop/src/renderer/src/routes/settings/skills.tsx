import { createFileRoute } from "@tanstack/react-router";
import SkillsSettings from "@settings/components/skills/SkillsSettings";

export const Route = createFileRoute("/settings/skills")({
  component: SkillsSettings,
});
