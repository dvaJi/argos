import { useEffect } from "react";
import { configAgentsChangedEvent } from "@argos/shared-contracts/events";
import type { AcpRegistryAgent } from "@argos/shared/presenter";
import { createConfigClient } from "#api/ConfigClient";
import { createSettingsClient } from "#api/SettingsClient";
import { getArgosBridge } from "#api/core";
import { toast } from "#/components/use-toast";
import { getAgentsWithUpdates, getInstalledVersion, updateAgentsSequentially } from "#/lib/acpAgentUpdates";

/** agentId -> registry version we already surfaced; bumping the version re-notifies. */
const notifiedAgentVersions = new Map<string, string>();

let checkInFlight = false;
let recheckRequested = false;

const describeUpdate = (agent: AcpRegistryAgent) =>
  `${agent.name} v${getInstalledVersion(agent) ?? "?"} → v${agent.version}`;

async function runUpdates(agents: AcpRegistryAgent[]): Promise<void> {
  const configClient = createConfigClient();
  const progress = toast({
    title: agents.length === 1 ? `Updating ${agents[0].name}…` : `Updating ${agents.length} agents…`,
    duration: 60_000,
  });
  const outcomes = await updateAgentsSequentially(agents, (id) => configClient.updateAcpAgent(id));
  progress.dismiss();

  const failed = outcomes.filter((outcome) => !outcome.ok);
  if (failed.length === 0) {
    toast({
      title: agents.length === 1 ? `${agents[0].name} updated` : `${agents.length} agents updated`,
      description: agents.map((agent) => `${agent.name} v${agent.version}`).join(", "),
    });
    return;
  }
  toast({
    title: failed.length === outcomes.length ? "Agent update failed" : "Some agent updates failed",
    description: failed.map((outcome) => `${outcome.agent.name}: ${outcome.ok ? "" : outcome.error}`).join("\n"),
    variant: "destructive",
    duration: 10_000,
    action: {
      label: "Open settings",
      onClick: () => void createSettingsClient().openSettings({ routeName: "settings-acp" }),
    },
  });
}

async function checkForAgentUpdates(): Promise<void> {
  // If a check is already running, remember that another was requested so we run
  // exactly one follow-up afterwards — a config event arriving mid-check could
  // carry a newer registry version the in-flight check hasn't seen yet.
  if (checkInFlight) {
    recheckRequested = true;
    return;
  }
  checkInFlight = true;

  try {
    const configClient = createConfigClient();
    const [acpEnabled, agents] = await Promise.all([
      configClient.getAcpEnabled(),
      configClient.listAcpRegistryAgents(),
    ]);
    if (!acpEnabled) return;

    // Only nag about agents the user actually has switched on; disabled agents
    // still show their update in Settings, and get toasted once re-enabled.
    const fresh = getAgentsWithUpdates(agents).filter(
      (agent) => agent.enabled && notifiedAgentVersions.get(agent.id) !== agent.version,
    );
    if (fresh.length === 0) return;

    for (const agent of fresh) {
      notifiedAgentVersions.set(agent.id, agent.version);
    }

    toast({
      title: fresh.length === 1 ? "Agent update available" : `${fresh.length} agent updates available`,
      description: fresh.map(describeUpdate).join(", "),
      duration: 12_000,
      action: {
        label: fresh.length === 1 ? "Update" : "Update all",
        onClick: () => void runUpdates(fresh),
      },
    });
  } catch (error) {
    console.warn("[Agents] Failed to check for ACP agent updates:", error);
  } finally {
    checkInFlight = false;
    if (recheckRequested) {
      recheckRequested = false;
      void checkForAgentUpdates();
    }
  }
}

export function useAcpAgentUpdateNotifications(): void {
  useEffect(() => {
    let disposed = false;
    const cleanup = getArgosBridge().on(configAgentsChangedEvent.name, () => {
      if (!disposed) void checkForAgentUpdates();
    });

    // Runs after the registry has had a chance to settle; the startup
    // `config.agents.changed` event usually fires before this.
    const timer = window.setTimeout(() => {
      if (!disposed) void checkForAgentUpdates();
    }, 8000);

    return () => {
      disposed = true;
      window.clearTimeout(timer);
      cleanup?.();
    };
  }, []);
}
