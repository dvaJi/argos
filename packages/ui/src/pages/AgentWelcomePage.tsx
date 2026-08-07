import { useStore } from "@tanstack/react-store";
import { Icon } from "@iconify/react";
import { agentStore } from "#/stores/ui/agent";
import { themeStore } from "#/stores/theme";
import { createSettingsClient } from "#api/SettingsClient";
import { BrandWordmark } from "#/components/brand/BrandWordmark";
import { ENTRANCE_CLASS } from "#/lib/pageMotion";
import AgentAvatar from "#/components/icons/AgentAvatar";
import logo from "#/assets/logo.png";
import logoDark from "#/assets/logo-dark.png";

const settingsClient = createSettingsClient();

export function AgentWelcomePage() {
  const agents = useStore(agentStore, (s) => s.agents);
  const isDark = useStore(themeStore, (s) => s.isDark);

  const enabledAgents = agents.filter((a) => a.enabled);
  const displayedAgents = enabledAgents.slice(0, 9);
  const hiddenAgentCount = enabledAgents.length - displayedAgents.length;

  const selectAgent = (agentId: string) => {
    agentStore.setState((s) => ({ ...s, selectedAgentId: agentId }));
  };

  const openAgentSettings = async () => {
    await settingsClient.openSettings({
      routeName: "settings-argos-agents",
    });
  };

  const manageButtonClass = "text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground";

  return (
    <div className="window-drag-region relative flex h-full w-full flex-col overflow-y-auto overflow-x-clip">
      <BrandWordmark topOffset="top-[4%]" />

      <div className="window-no-drag-region relative z-[1] mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-8 px-6 py-10">
        <header className={`flex flex-col items-center text-center ${ENTRANCE_CLASS}`}>
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border/70 bg-card/60">
            <img src={isDark ? logoDark : logo} alt="Argos" className="h-6 w-6" loading="lazy" />
          </div>
          <h1 className="mt-4 text-balance text-xl font-semibold tracking-tight text-foreground">Select an agent</h1>
          <p className="mt-1.5 max-w-xs text-balance text-[13px] leading-5 text-muted-foreground">
            Choose who handles this conversation.
          </p>
        </header>

        {displayedAgents.length > 0 ? (
          <div className={`w-full ${ENTRANCE_CLASS}`} style={{ animationDelay: "60ms" }}>
            <div className="flex items-center justify-between gap-3 px-1">
              <p className="text-xs font-medium text-muted-foreground">Agents</p>
              <button
                data-testid="agent-welcome-manage-action"
                type="button"
                className={manageButtonClass}
                onClick={() => void openAgentSettings()}
              >
                Manage agents
              </button>
            </div>

            <div data-testid="agent-welcome-grid" className="mt-2 grid w-full grid-cols-2 gap-2">
              {displayedAgents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  className="flex items-center gap-3 rounded-lg border border-border/70 bg-card/40 px-3.5 py-3 text-left transition duration-150 hover:border-border hover:bg-accent/50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
                  onClick={() => selectAgent(agent.id)}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/70 text-foreground">
                    <AgentAvatar agent={agent} className="h-5 w-5" fallbackClassName="rounded-md" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-foreground">{agent.name}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {agent.type === "argos" ? "Argos agent" : "ACP agent"}
                    </span>
                  </span>
                </button>
              ))}
            </div>

            {hiddenAgentCount > 0 && (
              <button
                type="button"
                data-testid="agent-welcome-show-all-action"
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border/70 px-3.5 py-2.5 text-xs text-muted-foreground transition duration-150 hover:border-border hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
                onClick={() => void openAgentSettings()}
              >
                Show all {enabledAgents.length} agents
              </button>
            )}
          </div>
        ) : (
          <div
            className={`flex w-full flex-col items-center rounded-xl border border-dashed border-border/70 px-6 py-10 text-center ${ENTRANCE_CLASS}`}
            style={{ animationDelay: "60ms" }}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-muted/70 text-muted-foreground">
              <Icon icon="lucide:bot" aria-hidden="true" className="h-5 w-5" />
            </span>
            <p className="mt-3 text-[13px] font-medium text-foreground">No agents set up yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Install or enable an agent to start chatting.</p>
            <button
              data-testid="agent-welcome-manage-action"
              type="button"
              className="mt-4 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition duration-150 hover:bg-primary/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
              onClick={() => void openAgentSettings()}
            >
              Manage agents
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
