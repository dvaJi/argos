import { createFileRoute } from "@tanstack/react-router";
import KnowledgeBaseSettings from "@settings/components/KnowledgeBaseSettings";

export const Route = createFileRoute("/settings/knowledge-base")({
  component: KnowledgeBaseSettings,
});
