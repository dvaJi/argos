import { useStore } from "@tanstack/react-store";
import { Icon } from "@iconify/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "#shadcn/components/ui/dropdown-menu";
import { agentStore, setSelectedAgent } from "#/stores/ui/agent";
import { sessionStore } from "#/stores/ui/session";
import { useThreadSidebarStore } from "#/stores/ui/threadSidebar";
import AgentAvatar from "../icons/AgentAvatar";
import { resolveEffectiveAgent } from "#/lib/effectiveAgent";
import { cn } from "#/lib/utils";
interface AgentSwitcherProps {
  /**
   * Visual variant.
   *  - `topbar` (default): small inline button suitable for a chat top bar.
   *  - `welcome`: a centered pill badge suitable for the welcome page's
   *    headline area.
   */
  variant?: "topbar" | "welcome";
  className?: string;
}

/**
 * Dropdown for switching the active agent. Used in two places:
 *  - the chat top bar (variant="topbar"), next to the project label;
 *  - the welcome page's headline area (variant="welcome").
 *
 * Switching policy:
 *  - If no active session, or the active session is settled, the switch
 *    applies immediately.
 *  - If the active session belongs to a *different* agent and is unsettled,
 *    the switch is refused (the user can settle/unsettle from the chat
 *    banner first, or finish the open thread).
 */
export default function AgentSwitcher({ variant = "topbar", className }: AgentSwitcherProps) {
  const { agents, selectedAgentId } = useStore(agentStore);
  const { activeSessionId, sessions } = useStore(sessionStore);
  const { settledAtById } = useThreadSidebarStore();
  const enabledAgents = agents.filter((a) => a.enabled);
  const currentAgent = (() => {
    const activeSession = activeSessionId ? (sessions.find((s) => s.id === activeSessionId) ?? null) : null;
    return resolveEffectiveAgent({
      agents,
      selectedAgentId,
      activeSessionAgentId: activeSession?.agentId ?? null,
    })?.agent;
  })();
  const canSwitchTo = (targetAgentId: string): boolean => {
    if (!activeSessionId) return true;
    const active = sessions.find((s) => s.id === activeSessionId);
    if (!active) return true;
    if (active.agentId === targetAgentId) return true;
    return active.id in settledAtById;
  };
  const handleSelect = (targetAgentId: string) => {
    if (!canSwitchTo(targetAgentId)) return;
    if (currentAgent?.id === targetAgentId) return;
    setSelectedAgent(targetAgentId);
  };
  const isWelcome = variant === "welcome";
  const label = currentAgent?.name ?? "All agents";
  const triggerClass = cn(
    "group flex items-center gap-1.5 transition-colors duration-150 active:scale-[0.97] motion-reduce:active:scale-100",
    isWelcome
      ? "h-7 rounded-full border border-border/70 bg-card/40 px-3 text-xs font-medium text-foreground/80 hover:bg-accent/40"
      : "h-7 rounded-md px-2 text-xs font-medium text-foreground/80 hover:bg-accent/50",
    className,
  );
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            data-testid={isWelcome ? "agent-welcome-switcher" : "agent-topbar-switcher"}
            data-agent-id={currentAgent?.id ?? null}
            data-test-variant={variant}
            className={cn("group", triggerClass)}
            aria-haspopup="menu"
          />
        }
      >
        {currentAgent ? (
          <AgentAvatar agent={currentAgent} className={cn(isWelcome ? "size-4" : "size-3.5", "shrink-0")} />
        ) : (
          <Icon
            icon="uil:layers"
            className={cn(isWelcome ? "size-4" : "size-3.5", "shrink-0 text-muted-foreground/80")}
          />
        )}
        <span className="truncate">{label}</span>
        <Icon
          icon="lucide:chevron-down"
          className="size-3 shrink-0 text-muted-foreground/70 transition-transform duration-150 group-data-[popup-open]:rotate-180"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={isWelcome ? "center" : "start"} className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs">Agents</DropdownMenuLabel>
          {enabledAgents.length === 0 ? (
            <DropdownMenuItem disabled>No agents enabled</DropdownMenuItem>
          ) : (
            enabledAgents.map((agent) => {
              const active = currentAgent?.id === agent.id;
              const disabled = !canSwitchTo(agent.id);
              return (
                <DropdownMenuItem
                  key={agent.id}
                  data-testid={`agent-switcher-option-${agent.id}`}
                  disabled={disabled}
                  onClick={() => handleSelect(agent.id)}
                  className={active ? "bg-accent/60" : ""}
                >
                  <AgentAvatar agent={agent} className="size-4 shrink-0" />
                  <span className="flex-1 truncate">{agent.name}</span>
                  {active && <Icon icon="lucide:check" className="size-3.5 text-muted-foreground" />}
                  {disabled && !active && (
                    <span
                      className="text-[10px] text-muted-foreground/70"
                      title="Settle or close the current thread to switch"
                    >
                      busy
                    </span>
                  )}
                </DropdownMenuItem>
              );
            })
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
