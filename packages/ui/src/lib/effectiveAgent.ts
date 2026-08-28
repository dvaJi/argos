import type { UIAgent } from "#/stores/ui/agent";

export interface EffectiveAgent {
  agent: UIAgent;
  type: "argos" | "acp";
}

/**
 * Resolves the agent a new thread will target, using the same priority as the
 * `AgentSwitcher`: the explicit user choice wins, then the active session's
 * agent (so opening an existing thread doesn't desync the composer), then the
 * first enabled Argos agent, then the first enabled agent. Returns `null` only
 * when no agent is enabled.
 */
export function resolveEffectiveAgent(input: {
  agents: UIAgent[];
  selectedAgentId: string | null;
  activeSessionAgentId: string | null;
}): EffectiveAgent | null {
  const enabledAgents = input.agents.filter((a) => a.enabled);
  if (enabledAgents.length === 0) return null;
  const findById = (id: string | null | undefined) => (id ? enabledAgents.find((a) => a.id === id) : undefined);
  const matched = findById(input.selectedAgentId) ?? findById(input.activeSessionAgentId);
  const fallback = enabledAgents.find((a) => (a.agentType ?? a.type) === "argos") ?? enabledAgents[0];
  const agent = matched ?? fallback;
  return { agent, type: agent.agentType ?? agent.type };
}
