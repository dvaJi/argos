import { useEffect } from "react";
import { configAgentsChangedEvent } from "@argos/shared-contracts/events";
import type { AcpRegistryAgent } from "@argos/shared/presenter";
import { createConfigClient } from "#api/ConfigClient";
import { createSettingsClient } from "#api/SettingsClient";
import { getArgosBridge } from "#api/core";
import { toast } from "#/components/use-toast";

/** agentId -> registry version we already surfaced; bumping the version re-notifies. */
const notifiedAgentVersions = new Map<string, string>();

let checkInFlight = false;
let recheckRequested = false;

const getUpdateAvailableAgents = (agents: AcpRegistryAgent[]): AcpRegistryAgent[] =>
  agents.filter(
    (agent) =>
      agent.installState?.status === "installed" &&
      Boolean(agent.installState.version) &&
      agent.installState.version !== agent.version,
  );

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

    const updates = getUpdateAvailableAgents(agents);
    const fresh = updates.filter((agent) => notifiedAgentVersions.get(agent.id) !== agent.version);
    if (fresh.length === 0) return;

    for (const agent of fresh) {
      notifiedAgentVersions.set(agent.id, agent.version);
    }

    const settingsClient = createSettingsClient();
    if (fresh.length === 1) {
      const agent = fresh[0];
      toast({
        title: "Agent update available",
        description: `${agent.name} is on v${agent.installState?.version}, v${agent.version} is available.`,
        duration: 8000,
        action: {
          label: "View updates",
          onClick: () => {
            void settingsClient.openSettings({ routeName: "settings-acp" });
          },
        },
      });
      return;
    }

    toast({
      title: `${fresh.length} agent updates available`,
      description: fresh.map((agent) => agent.name).join(", "),
      duration: 8000,
      action: {
        label: "View updates",
        onClick: () => {
          void settingsClient.openSettings({ routeName: "settings-acp" });
        },
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
    // `config.agents.changed` event usually fires before this. Ignore it when
    // the user already opened the settings window with the check in flight.
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
