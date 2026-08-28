import { useMemo, useState } from "react";
import { useStore } from "@tanstack/react-store";
import { Icon } from "@iconify/react";
import { sessionStore, type UISession } from "#/stores/ui/session";
import { agentStore } from "#/stores/ui/agent";

interface RecentSessionsStripProps {
  /** The active agent id; the strip shows recent sessions for this agent. */
  agentId: string | null;
  /** Cap on how many rows to show. */
  limit?: number;
  onSelect: (sessionId: string) => void;
}

function formatRelativeTime(timestamp: number, now: number): string {
  const diffMs = Math.max(0, now - timestamp);
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(timestamp).toLocaleDateString();
}

/**
 * Recent-session list for the active agent, shown under the new-thread
 * composer so the user can jump straight back into a thread. Hidden if there
 * are fewer than two recent sessions, or no active agent.
 */
export default function RecentSessionsStrip({ agentId, limit = 6, onSelect }: RecentSessionsStripProps) {
  const { sessions } = useStore(sessionStore);
  const { agents } = useStore(agentStore);
  // Lazy initializer: `Date.now` is impure and must not run during render.
  const [now] = useState(() => Date.now());

  const recent = useMemo<UISession[]>(() => {
    if (!agentId) return [];
    return sessions
      .filter((session) => session.agentId === agentId && !session.isDraft)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit);
  }, [sessions, agentId, limit]);

  const agentName = useMemo(() => agents.find((agent) => agent.id === agentId)?.name ?? null, [agents, agentId]);

  if (recent.length < 2) return null;

  return (
    <div className="mt-5 flex min-h-0 w-full flex-col gap-2">
      <p className="px-1 text-[11px] font-medium text-muted-foreground/70">Recent in {agentName ?? "this agent"}</p>
      <ul className="flex min-h-0 max-h-[240px] flex-col gap-px overflow-y-auto">
        {recent.map((session) => (
          <li key={session.id}>
            <button
              type="button"
              onClick={() => onSelect(session.id)}
              title={session.title}
              className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-foreground/85 transition-colors duration-150 hover:bg-accent/40 hover:text-foreground"
            >
              <Icon icon="lucide:message-square" className="size-3.5 shrink-0 text-muted-foreground/60" />
              <span className="min-w-0 flex-1 truncate font-medium">{session.title || "Untitled session"}</span>
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/60">
                {formatRelativeTime(session.updatedAt, now)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
