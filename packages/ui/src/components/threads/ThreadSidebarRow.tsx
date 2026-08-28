import { useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { useAgentStore } from "#/stores/ui/agent";
import type { UISession } from "#/stores/ui/session";
import { Input } from "#shadcn/components/ui/input";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "#shadcn/components/ui/context-menu";
import AgentAvatar from "../icons/AgentAvatar";
import {
  formatAge,
  formatWakeCountdown,
  formatWorkingElapsed,
  highlightSegments,
  resolveThreadPill,
  resolveThreadStatus,
} from "./threadSidebarLogic";

export type ThreadRowVariant = "active" | "snoozed" | "settled";

interface ThreadSidebarRowProps {
  session: UISession;
  variant: ThreadRowVariant;
  /** Currently open session in the chat panel. */
  isSelected: boolean;
  /** Keyboard-navigation highlight while searching. */
  isNavSelected: boolean;
  query: string;
  now: number;
  workingSince?: number;
  snoozedUntil?: number;
  isWoke?: boolean;
  /** Settled timestamp (ms) when the row is settled; 0 = unknown (legacy). */
  settledAt?: number;
  onSelect: (session: UISession) => void;
  onSettle: (session: UISession) => void;
  onUnsettle: (session: UISession) => void;
  onTogglePin: (session: UISession) => void;
  onSnooze: (session: UISession, durationMs: number) => void;
  onUnsnooze: (session: UISession) => void;
  onRename: (session: UISession, title: string) => void;
  onDelete: (session: UISession) => void;
}

const SNOOZE_OPTIONS: Array<{ label: string; durationMs: number }> = [
  { label: "1 hour", durationMs: 60 * 60_000 },
  { label: "8 hours", durationMs: 8 * 60 * 60_000 },
  { label: "24 hours", durationMs: 24 * 60 * 60_000 },
];

/**
 * t3code-style slim thread row: avatar + title (search-highlighted) + status
 * pill + right-aligned time slot, with a hover Settle/Un-settle affordance and
 * a context menu (pin / rename / snooze / settle / delete).
 */
export default function ThreadSidebarRow({
  session,
  variant,
  isSelected,
  isNavSelected,
  query,
  now,
  workingSince,
  snoozedUntil,
  isWoke,
  settledAt,
  onSelect,
  onSettle,
  onUnsettle,
  onTogglePin,
  onSnooze,
  onUnsnooze,
  onRename,
  onDelete,
}: ThreadSidebarRowProps) {
  const { enabledAgents } = useAgentStore();
  const agent = enabledAgents.find((a) => a.id === session.agentId) ?? null;
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(session.title);
  const editInputRef = useRef<HTMLInputElement>(null);

  const status = resolveThreadStatus(session);
  const pill = variant === "active" ? resolveThreadPill(status) : null;
  const segments = highlightSegments(session.title || "Untitled session", query);

  useEffect(() => {
    if (editing) {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }
  }, [editing]);

  const commitRename = () => {
    const nextTitle = draftTitle.trim();
    setEditing(false);
    if (nextTitle && nextTitle !== session.title) {
      onRename(session, nextTitle);
    }
  };

  const rightSlot = (() => {
    if (editing) return null;
    if (variant === "snoozed") {
      if (typeof snoozedUntil === "number" && snoozedUntil > now) {
        return (
          <span className="text-[11px] tabular-nums text-muted-foreground/60">
            {formatWakeCountdown(snoozedUntil, now)}
          </span>
        );
      }
      return (
        <button
          type="button"
          data-testid="thread-sidebar-woke"
          onClick={(event) => {
            event.stopPropagation();
            onSelect(session);
          }}
          className="flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary transition-colors hover:bg-primary/20"
        >
          <Icon icon="lucide:alarm-clock" className="size-3" />
          Woke
        </button>
      );
    }
    if (variant === "active" && session.status === "working" && typeof workingSince === "number") {
      return (
        <span data-testid="thread-sidebar-working-pill" className="shrink-0 text-[11px] tabular-nums text-primary">
          {formatWorkingElapsed(workingSince, now)}
        </span>
      );
    }
    if (variant === "settled") {
      // Prefer the settled time (t3code parity); legacy entries without one
      // fall back to the session's updatedAt.
      const label = isWoke ? "Woke" : formatAge(settledAt && settledAt > 0 ? settledAt : session.updatedAt, now);
      return <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/50">{label}</span>;
    }
    return (
      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/50">
        {formatAge(session.updatedAt, now)}
      </span>
    );
  })();

  const hoverAction = (() => {
    if (editing) return null;
    if (variant === "settled") {
      return (
        <button
          type="button"
          title="Un-settle thread"
          aria-label="Un-settle thread"
          onClick={(event) => {
            event.stopPropagation();
            onUnsettle(session);
          }}
          className="hidden h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground group-hover:flex"
        >
          <Icon icon="lucide:archive-restore" className="size-3.5" />
        </button>
      );
    }
    if (variant === "snoozed") {
      return (
        <button
          type="button"
          title="Unsnooze thread"
          aria-label="Unsnooze thread"
          onClick={(event) => {
            event.stopPropagation();
            onUnsnooze(session);
          }}
          className="hidden h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground group-hover:flex"
        >
          <Icon icon="lucide:alarm-clock-off" className="size-3.5" />
        </button>
      );
    }
    return (
      <button
        type="button"
        title="Settle thread"
        aria-label="Settle thread"
        onClick={(event) => {
          event.stopPropagation();
          onSettle(session);
        }}
        className="hidden h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground group-hover:flex"
      >
        <Icon icon="lucide:circle-check" className="size-3.5" />
      </button>
    );
  })();

  return (
    <ContextMenu>
      {/* The trigger is a div: rows contain real action buttons (select, settle,
          unsnooze) and HTML forbids interactive elements nested in <button>
          (docs/features/thread-sidebar-t3-parity). The div is the right-click
          surface and whole-row click target; the inner select <button> provides
          keyboard access. */}
      <ContextMenuTrigger
        render={
          <div
            role="button"
            tabIndex={0}
            data-testid="thread-sidebar-row"
            data-session-id={session.id}
            data-variant={variant}
            data-selected={String(isSelected)}
            data-nav-selected={String(isNavSelected)}
            data-editing={editing ? "true" : undefined}
            onClick={() => onSelect(session)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(session);
              }
            }}
            className={`group flex w-full cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors duration-150 outline-none focus-visible:ring-1 focus-visible:ring-primary/40 active:scale-[0.99] motion-reduce:active:scale-100 ${
              editing
                ? "bg-sidebar-row-active/40"
                : isSelected
                  ? "bg-sidebar-row-active/60 text-foreground"
                  : isNavSelected
                    ? "bg-sidebar-row-hover text-foreground"
                    : "text-sidebar-foreground/85 hover:bg-sidebar-row-hover"
            }`}
          >
            {editing ? (
              <>
                {agent ? (
                  <AgentAvatar agent={agent} className="size-3.5 shrink-0" />
                ) : (
                  <Icon icon="lucide:message-square" className="size-3.5 shrink-0 text-muted-foreground/60" />
                )}
                <Input
                  ref={editInputRef}
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") commitRename();
                    if (event.key === "Escape") {
                      setDraftTitle(session.title);
                      setEditing(false);
                    }
                  }}
                  onBlur={commitRename}
                  className="h-6 min-w-0 flex-1 rounded-md border-0 bg-muted/60 px-1.5 text-[13px] shadow-none focus-visible:ring-1"
                  aria-label="Thread title"
                />
              </>
            ) : (
              <>
                {agent ? (
                  <AgentAvatar agent={agent} className="size-3.5 shrink-0" />
                ) : (
                  <Icon icon="lucide:message-square" className="size-3.5 shrink-0 text-muted-foreground/60" />
                )}
                <span className="min-w-0 flex-1 truncate font-medium">
                  {segments.map((segment, index) =>
                    segment.match ? (
                      <mark key={index} className="rounded-sm bg-primary/20 px-0.5 text-foreground">
                        {segment.text}
                      </mark>
                    ) : (
                      <span key={index}>{segment.text}</span>
                    ),
                  )}
                </span>
                {pill && (
                  <span
                    data-testid={`thread-sidebar-pill-${status}`}
                    className={`flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${pill.className} ${
                      pill.pulse ? "animate-pulse motion-reduce:animate-none" : ""
                    }`}
                  >
                    <Icon icon={pill.icon} className="size-3" />
                    {pill.label}
                  </span>
                )}
                {rightSlot}
                {hoverAction}
              </>
            )}
          </div>
        }
      />
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onTogglePin(session)}>
          <Icon icon={session.isPinned ? "lucide:pin-off" : "lucide:pin"} className="size-3.5" />
          {session.isPinned ? "Unpin thread" : "Pin thread"}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => setEditing(true)}>
          <Icon icon="lucide:pencil" className="size-3.5" />
          Rename thread
        </ContextMenuItem>
        <ContextMenuSeparator />
        {variant === "snoozed" ? (
          <ContextMenuItem onClick={() => onUnsnooze(session)}>
            <Icon icon="lucide:alarm-clock-off" className="size-3.5" />
            Unsnooze thread
          </ContextMenuItem>
        ) : (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Icon icon="lucide:alarm-clock" className="size-3.5" />
              Snooze thread
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {SNOOZE_OPTIONS.map((option) => (
                <ContextMenuItem key={option.label} onClick={() => onSnooze(session, option.durationMs)}>
                  {option.label}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}
        {variant === "settled" ? (
          <ContextMenuItem onClick={() => onUnsettle(session)}>
            <Icon icon="lucide:archive-restore" className="size-3.5" />
            Un-settle thread
          </ContextMenuItem>
        ) : (
          <ContextMenuItem onClick={() => onSettle(session)}>
            <Icon icon="lucide:circle-check" className="size-3.5" />
            Settle thread
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={() => {
            if (window.confirm(`Delete "${session.title || "Untitled session"}"? This cannot be undone.`)) {
              onDelete(session);
            }
          }}
          className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
        >
          <Icon icon="lucide:trash-2" className="size-3.5" />
          Delete thread
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
