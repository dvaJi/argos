import type { IConfigPresenter, MCPToolDefinition } from "@argos/shared/presenter";

export async function getAgentFilteredTools(
  agentId: string,
  allTools: MCPToolDefinition[],
  configPresenter: IConfigPresenter,
): Promise<MCPToolDefinition[]> {
  if (!agentId) return [];

  const selections = await configPresenter.getAgentMcpSelections(agentId);
  if (!selections?.length) return [];

  const selectionSet = new Set(selections);
  return allTools.filter((tool) => selectionSet.has(tool.server?.name));
}
