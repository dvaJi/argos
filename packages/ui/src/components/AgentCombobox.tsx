import { useState } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Input } from "#shadcn/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "#shadcn/components/ui/popover";
import type { Agent } from "@argos/shared/types/agent-interface";
import AgentAvatar from "#/components/icons/AgentAvatar";
import { cn } from "#/lib/utils";

interface AgentComboboxProps {
  agents: Agent[];
  value: string;
  onValueChange: (agentId: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

/** Searchable agent picker with avatar/icon and a hover description pane. */
export default function AgentCombobox({
  agents,
  value,
  onValueChange,
  disabled,
  className,
  placeholder = "Select agent",
}: AgentComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const selected = agents.find((agent) => agent.id === value) ?? null;
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? agents.filter((agent) =>
        [agent.name, agent.id, agent.description]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(normalizedQuery)),
      )
    : agents;
  const hovered = agents.find((agent) => agent.id === hoveredId) ?? selected;

  const choose = (agentId: string) => {
    onValueChange(agentId);
    setOpen(false);
    setQuery("");
    setHoveredId(null);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery("");
          setHoveredId(null);
        }
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn("h-9 w-full justify-between px-3 text-left font-normal", className)}
          />
        }
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected ? (
            <AgentAvatar agent={selected} className="size-4 shrink-0" />
          ) : (
            <span className="flex size-4 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Icon icon="lucide:bot" className="size-3" />
            </span>
          )}
          <span className="min-w-0 truncate">{selected?.name ?? placeholder}</span>
          {selected && <span className="truncate text-xs text-muted-foreground">{selected.id}</span>}
        </span>
        <Icon icon="lucide:chevron-down" className="size-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(24rem,calc(100vw-2rem))] overflow-hidden p-0">
        <div className="border-b p-2">
          <div className="relative">
            <Icon
              icon="lucide:search"
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && filtered[0]) {
                  event.preventDefault();
                  choose(filtered[0].id);
                }
              }}
              placeholder="Search agents…"
              className="h-8 pl-8"
              aria-label="Search agents"
            />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">No agents match “{query}”.</div>
          ) : (
            filtered.map((agent) => {
              const active = agent.id === value;
              return (
                <button
                  key={agent.id}
                  type="button"
                  onMouseEnter={() => setHoveredId(agent.id)}
                  onFocus={() => setHoveredId(agent.id)}
                  onClick={() => choose(agent.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
                    active && "bg-accent/60",
                  )}
                  data-testid={`agent-option-${agent.id}`}
                >
                  <AgentAvatar agent={agent} className="size-5 shrink-0" fallbackClassName="rounded-md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{agent.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{agent.id}</span>
                  </span>
                  {active && <Icon icon="lucide:check" className="size-4 shrink-0 text-muted-foreground" />}
                </button>
              );
            })
          )}
        </div>
        <div className="h-16 overflow-hidden border-t bg-muted/30 px-3 py-2 text-xs">
          {hovered ? (
            <div className="flex h-full min-w-0 flex-col gap-0.5">
              <span className="block min-w-0 truncate font-medium text-foreground">{hovered.name}</span>
              <span className="line-clamp-2 min-w-0 break-words text-muted-foreground">
                {hovered.description?.trim() || "No description for this agent."}
              </span>
            </div>
          ) : (
            <span className="text-muted-foreground">Hover an agent to see its description.</span>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
