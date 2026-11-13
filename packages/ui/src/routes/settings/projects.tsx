import { createFileRoute } from "@tanstack/react-router";
import ProjectsSettings from "#settings/components/ProjectsSettings";

export const Route = createFileRoute("/settings/projects")({
  component: ProjectsSettings,
});
