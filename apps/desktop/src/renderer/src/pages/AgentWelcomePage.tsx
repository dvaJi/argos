import { type CSSProperties, useMemo } from "react";
import { useSelector } from "@tanstack/react-store";
import { agentStore } from "@/stores/ui/agent";
import { createSettingsClient } from "@api/SettingsClient";
import AgentAvatar from "@/components/icons/AgentAvatar";
import logoDark from "@/assets/logo-dark.png";

const settingsClient = createSettingsClient();

export function AgentWelcomePage() {
  const agentState = useSelector(agentStore, (s) => s);
  const displayedAgents = useMemo(() => agentState.agents.filter((a) => a.enabled).slice(0, 9), [agentState.agents]);

  const selectAgent = (agentId: string) => {
    agentStore.setState((s) => ({ ...s, selectedAgentId: agentId }));
  };

  const openAgentSettings = async () => {
    await settingsClient.openSettings({
      routeName: "settings-argos-agents",
    });
  };

  return (
    <div className="h-full w-full flex flex-col" style={{ WebkitAppRegion: "drag" } as CSSProperties}>
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="mb-5">
          <img src={logoDark} className="w-16 h-16" loading="lazy" />
        </div>

        <h1 className="mb-10 text-3xl font-semibold text-foreground">Select an Agent</h1>

        <div className="grid w-full max-w-3xl grid-cols-3 gap-3">
          {displayedAgents.map((agent) => (
            <button
              key={agent.id}
              className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/40 px-4 py-3 text-left transition-all duration-150 hover:border-border hover:bg-accent/40"
              style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
              onClick={() => selectAgent(agent.id)}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/50 text-foreground">
                <AgentAvatar agent={agent} className="h-6 w-6" fallbackClassName="rounded-lg" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-foreground">{agent.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {agent.type === "argos" ? "Argos Agent" : "ACP Agent"}
                </div>
              </div>
            </button>
          ))}
        </div>

        <button
          className="mt-8 text-xs text-muted-foreground transition-colors hover:text-foreground"
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
          onClick={openAgentSettings}
        >
          Manage Agents
        </button>
      </div>
    </div>
  );
}
