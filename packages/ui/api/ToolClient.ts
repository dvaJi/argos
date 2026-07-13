import type { ArgosBridge } from "@argos/shared-contracts/bridge";
import { toolsListDefinitionsRoute } from "@argos/shared-contracts/routes";
import { getArgosBridge } from "./core";

export function createToolClient(bridge: ArgosBridge = getArgosBridge()) {
  async function getAllToolDefinitions(context: {
    enabledMcpTools?: string[];
    disabledAgentTools?: string[];
    chatMode?: "agent" | "acp agent";
    supportsVision?: boolean;
    agentWorkspacePath?: string | null;
    conversationId?: string;
  }) {
    const result = await bridge.invoke(toolsListDefinitionsRoute.name, context);
    return result.tools;
  }

  return {
    getAllToolDefinitions,
  };
}

export type ToolClient = ReturnType<typeof createToolClient>;
