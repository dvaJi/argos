import zod from "zod";
import type { MCPToolDefinition } from "@argos/shared/presenter";
import { defineRouteContract } from "../common";

const MCPToolDefinitionSchema = zod.custom<MCPToolDefinition>();

export const toolsListDefinitionsRoute = defineRouteContract({
  name: "tools.listDefinitions",
  input: zod.object({
    enabledMcpTools: zod.array(zod.string()).optional(),
    disabledAgentTools: zod.array(zod.string()).optional(),
    chatMode: zod.enum(["agent", "acp agent"]).optional(),
    supportsVision: zod.boolean().optional(),
    agentWorkspacePath: zod.string().nullable().optional(),
    conversationId: zod.string().optional(),
  }),
  output: zod.object({
    tools: zod.array(MCPToolDefinitionSchema),
  }),
});
