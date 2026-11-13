import type { AcpRegistryAgent } from "@argos/shared/presenter";

/**
 * Single source of truth for "this installed ACP agent has a newer registry
 * version". Shared by the update toast and the settings page so the toast can
 * never announce an update the settings page does not offer a button for.
 */
export const hasAgentUpdate = (agent: AcpRegistryAgent): boolean => {
  const state = agent.installState;
  if (state?.status !== "installed") return false;
  return Boolean(state.version) && state.version !== agent.version;
};

export const getAgentsWithUpdates = (agents: AcpRegistryAgent[]): AcpRegistryAgent[] => agents.filter(hasAgentUpdate);

/** Installed version as recorded locally (may lag the registry version). */
export const getInstalledVersion = (agent: AcpRegistryAgent): string | null => agent.installState?.version ?? null;

/** npx/uvx agents fetch their package at launch; only binaries are downloaded up front. */
export const isPackageAgent = (agent: AcpRegistryAgent): boolean => !agent.distribution.binary;

export type AgentUpdateOutcome =
  | { agent: AcpRegistryAgent; ok: true }
  | { agent: AcpRegistryAgent; ok: false; error: string };

/**
 * Updates agents one at a time — binary updates write shared install state, so
 * they must not run concurrently.
 */
export async function updateAgentsSequentially(
  agents: AcpRegistryAgent[],
  update: (agentId: string) => Promise<{ status: string; error?: string | null }>,
  onProgress?: (agent: AcpRegistryAgent) => void,
): Promise<AgentUpdateOutcome[]> {
  const outcomes: AgentUpdateOutcome[] = [];
  for (const agent of agents) {
    onProgress?.(agent);
    try {
      const state = await update(agent.id);
      if (state.status === "error") {
        outcomes.push({ agent, ok: false, error: state.error ?? "Update failed" });
      } else {
        outcomes.push({ agent, ok: true });
      }
    } catch (error) {
      outcomes.push({ agent, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return outcomes;
}
