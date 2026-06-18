import { createFileRoute } from "@tanstack/react-router";
import McpSettings from "@settings/components/McpSettings";

export const Route = createFileRoute("/settings/mcp")({
  component: McpSettings,
});
