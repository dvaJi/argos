import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "#shadcn/components/ui/dialog";
import { Input } from "#shadcn/components/ui/input";
import type { Agent, SessionWithState } from "@argos/shared/types/agent-interface";
import { createConfigClient } from "#api/ConfigClient";
import { createSessionClient } from "#api/SessionClient";
import AgentAvatar from "#/components/icons/AgentAvatar";

const sessionClient = createSessionClient();
const configClient = createConfigClient();

interface SessionPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value?: string | null;
  onSelect: (session: SessionWithState) => void;
  onClear?: () => void;
}

function basename(value: string | null | undefined): string {
  if (!value) return "";
  const normalized = value.replace(/\\/g, "/").replace(/\/+$/, "");
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}

export default function SessionPickerDialog({
  open,
  onOpenChange,
  value,
  onSelect,
  onClear,
}: SessionPickerDialogProps) {
  const [sessions, setSessions] = useState<SessionWithState[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void Promise.all([sessionClient.list({ includeSubagents: false }), configClient.listAgents()])
      .then(([sessionResult, agentResult]) => {
        if (cancelled) return;
        const visible = sessionResult.sessions
          .filter((session) => session.sessionKind !== "subagent" && !session.archivedAt)
          .sort((left, right) => right.updatedAt - left.updatedAt);
        setSessions(visible);
        setAgents(agentResult);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setSessions([]);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const agentsById = new Map(agents.map((agent) => [agent.id, agent]));
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? sessions.filter((session) =>
        [session.title, session.id, session.agentId, session.projectDir]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(normalizedQuery)),
      )
    : sessions;
  const selected = value ? sessions.find((session) => session.id === value) : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setLoading(true);
        if (!next) setQuery("");
        onOpenChange(next);
      }}
    >
      <DialogContent showCloseButton={false} className="overflow-hidden p-0 sm:max-w-[560px]">
        <div className="flex max-h-[70vh] flex-col">
          <DialogHeader className="border-b px-5 pb-4 pt-5 text-left">
            <DialogTitle>Choose a session</DialogTitle>
            <DialogDescription>
              The trigger will send its prompt into this session instead of creating a new one.
            </DialogDescription>
          </DialogHeader>

          <div className="border-b p-3">
            <div className="relative">
              <Icon
                icon="lucide:search"
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by title, agent, project, or session ID…"
                className="h-8 pl-8"
                aria-label="Search sessions"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2" data-testid="session-picker-list">
            {loading ? (
              <div className="flex items-center justify-center gap-2 px-3 py-10 text-sm text-muted-foreground">
                <Icon icon="lucide:loader-2" className="size-4 animate-spin" />
                Loading sessions…
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-10 text-center text-sm text-muted-foreground">
                {sessions.length === 0 ? "No sessions yet." : `No sessions match “${query}”.`}
              </div>
            ) : (
              filtered.map((session) => {
                const agent = agentsById.get(session.agentId);
                const active = session.id === value;
                return (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => {
                      onSelect(session);
                      onOpenChange(false);
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none ${
                      active ? "bg-accent/60" : ""
                    }`}
                    data-testid={`session-option-${session.id}`}
                  >
                    {agent ? (
                      <AgentAvatar agent={agent} className="size-6 shrink-0" fallbackClassName="rounded-md" />
                    ) : (
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <Icon icon="lucide:message-square" className="size-3.5" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-sm font-medium">{session.title || "Untitled session"}</span>
                        {active && <Icon icon="lucide:check" className="size-3.5 shrink-0 text-muted-foreground" />}
                      </span>
                      <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="truncate">{agent?.name ?? session.agentId}</span>
                        {session.projectDir && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="truncate">{basename(session.projectDir)}</span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span className="shrink-0">{new Date(session.updatedAt).toLocaleDateString()}</span>
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <DialogFooter className="border-t px-4 py-3">
            {selected && onClear && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  onClear();
                  onOpenChange(false);
                }}
              >
                Clear selection
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
