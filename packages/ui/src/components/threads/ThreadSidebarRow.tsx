import { memo, useEffect, useRef, useState, type MouseEvent } from "react";
import { Icon } from "@iconify/react";
import { useAgentStore } from "#/stores/ui/agent";
import type { UISession } from "#/stores/ui/session";
import { cn } from "#/lib/utils";
import { Input } from "#shadcn/components/ui/input";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import ProjectIcon from "../projects/ProjectIcon";
import type { ProjectIconValue } from "#/stores/ui/projectIdentity";
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
  canSnooze,
  formatAge,
  formatWakeLabel,
  formatWorkingElapsed,
  highlightSegments,
  resolveRowStatus,
  resolveSnoozePresets,
  shouldRecede,
  type ThreadRowStatus,
  type ThreadSectionId,
} from "./threadSidebarLogic";

interface ThreadSidebarRowProps {
  session: UISession;
  section: ThreadSectionId;
  /** Currently open session in the chat panel. */
  isSelected: boolean;
  /** Keyboard-navigation highlight while searching. */
  isNavSelected: boolean;
  query: string;
  now: number;
  /** Right-slot timestamp: return time (active/pinned) or settled time (settled). */
  timestamp: number;
  workingSince?: number;
  /** Pending wake time for snoozed rows. */
  snoozedUntil?: number;
  isWoke: boolean;
  /** Alt/⌘+N shortcut badge label while the modifier is held, else null. */
  shortcutBadge?: string | null;
  onSelect: (session: UISession) => void;
  onSettle: (session: UISession) => void;
  onUnsettle: (session: UISession) => void;
  onTogglePin: (session: UISession) => void;
  onSnooze: (session: UISession, until: number) => void;
  onUnsnooze: (session: UISession) => void;
  onDismissWoke: (session: UISession) => void;
  onRename: (session: UISession, title: string) => void;
  /** Hide the thread from the sidebar (docs/features/thread-archive). */
  onArchive: (session: UISession) => void;
  /** Open the shared delete-confirmation dialog for this session. */
  onRequestDelete: (session: UISession) => void;
  /** Project line (docs/features/project-settings); null = no project. Primitives keep memo cheap. */
  projectName: string | null;
  projectIconKind: ProjectIconValue["kind"] | null;
  projectIconValue: string | null;
  branch: string | null;
  /** `provider/model`, or the agent name for ACP sessions. */
  modelLabel: string | null;
  machineLabel: string;
  /** Open Settings → Projects for this thread's project. */
  onOpenProjectSettings: (session: UISession) => void;
}

const POPOVER_STATUS: Record<ThreadRowStatus, { label: string; className: string } | null> = {
  approval: { label: "Pending approval", className: "text-amber-600 dark:text-amber-300" },
  failed: { label: "Error occurred", className: "text-red-600 dark:text-red-300" },
  working: { label: "Working", className: "text-sky-600 dark:text-sky-300" },
  woke: { label: "Woke from snooze", className: "text-amber-600 dark:text-amber-300" },
  done: { label: "Completed", className: "text-emerald-600 dark:text-emerald-300" },
  ready: null,
};

const STATUS_STYLE: Record<Exclude<ThreadRowStatus, "ready">, { label: string; icon: string; className: string }> = {
  working: { label: "Working", icon: "lucide:loader-circle", className: "text-sky-600 dark:text-sky-300/80" },
  approval: { label: "Approval", icon: "lucide:shield-alert", className: "text-amber-600 dark:text-amber-300/90" },
  failed: { label: "Failed", icon: "lucide:circle-x", className: "text-red-600 dark:text-red-300/90" },
  woke: { label: "Woke", icon: "lucide:alarm-clock", className: "text-amber-600 dark:text-amber-300/90" },
  done: { label: "Done", icon: "lucide:circle-check", className: "text-emerald-600 dark:text-emerald-300/90" },
};

/**
 * Hover / keyboard-focus action overlaying the right slot (no layout shift).
 * focus-visible, not focus-within: a mouse-clicked row keeps focus and must
 * keep showing its time, not the action.
 */
const ACTION_CLASS =
  "pointer-events-none absolute inset-y-0 right-0 flex items-center justify-center rounded-md px-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:pointer-events-auto focus-visible:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-visible:pointer-events-auto group-focus-visible:opacity-100 group-has-[:focus-visible]:pointer-events-auto group-has-[:focus-visible]:opacity-100";

/**
 * t3code-style thread card (docs/features/project-settings):
 *
 *   [IA] infera                       3m   ← project line + right slot (hover: ✓ Settle)
 *   [◎] Greeting            ⚠ Approval     ← title + status
 *   ⑂ main                                 ← branch (when known)
 *
 * Rows without a project put the right slot on the title line; rows without a
 * branch drop the last line. Hovering ~500 ms shows a details popover
 * (title, project, machine, branch, model, status).
 */
function ThreadSidebarRow({
  session,
  section,
  isSelected,
  isNavSelected,
  query,
  now,
  timestamp,
  workingSince,
  snoozedUntil,
  isWoke,
  shortcutBadge,
  onSelect,
  onSettle,
  onUnsettle,
  onTogglePin,
  onSnooze,
  onUnsnooze,
  onDismissWoke,
  onRename,
  onArchive,
  onRequestDelete,
  projectName,
  projectIconKind,
  projectIconValue,
  branch,
  modelLabel,
  machineLabel,
  onOpenProjectSettings,
}: ThreadSidebarRowProps) {
  const { enabledAgents } = useAgentStore();
  const agent = enabledAgents.find((candidate) => candidate.id === session.agentId) ?? null;
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(session.title);
  const [syncedTitle, setSyncedTitle] = useState(session.title);
  const [snoozeMenuNow, setSnoozeMenuNow] = useState(() => new Date());
  const editInputRef = useRef<HTMLInputElement>(null);

  // Keep the rename draft in sync with external title changes without a
  // set-state-in-effect (adjust-state-during-render).
  if (session.title !== syncedTitle) {
    setSyncedTitle(session.title);
    if (!editing) setDraftTitle(session.title);
  }

  useEffect(() => {
    if (!editing) return;
    editInputRef.current?.focus();
    editInputRef.current?.select();
  }, [editing]);

  const isSettled = section === "settled";
  const isSnoozed = section === "snoozed";
  const status = resolveRowStatus(session, isWoke && !isSettled);
  const recede = shouldRecede(status, isSelected);
  const statusStyle = status === "ready" ? null : STATUS_STYLE[status];
  const segments = highlightSegments(session.title || "Untitled session", query);

  const commitRename = () => {
    const nextTitle = draftTitle.trim();
    setEditing(false);
    if (nextTitle && nextTitle !== session.title) onRename(session, nextTitle);
  };

  const stop = (handler: () => void) => (event: MouseEvent) => {
    event.stopPropagation();
    handler();
  };

  const statusNode = statusStyle ? (
    status === "woke" ? (
      <button
        type="button"
        data-testid="thread-sidebar-woke"
        title="Dismiss Woke notification"
        aria-label="Dismiss Woke notification"
        onClick={stop(() => onDismissWoke(session))}
        className={cn(
          "relative z-20 flex shrink-0 items-center gap-1 rounded-sm text-[11px] font-medium hover:underline",
          statusStyle.className,
        )}
      >
        <Icon icon={statusStyle.icon} className="size-3" />
        {statusStyle.label}
      </button>
    ) : (
      <span
        data-testid={`thread-sidebar-status-${status}`}
        role="status"
        className={cn("flex shrink-0 items-center gap-1 text-[11px] font-medium", statusStyle.className)}
      >
        <Icon
          icon={statusStyle.icon}
          className={cn("size-3", status === "working" && "animate-spin motion-reduce:animate-none")}
        />
        {statusStyle.label}
        {status === "working" && typeof workingSince === "number" && (
          <span className="tabular-nums">{formatWorkingElapsed(workingSince, now)}</span>
        )}
      </span>
    )
  ) : null;

  const timeLabel =
    isSnoozed && typeof snoozedUntil === "number" ? (
      <span className="flex items-center gap-1 text-sky-600 dark:text-sky-300/80">
        <Icon icon="lucide:alarm-clock" className="size-3" />
        {formatWakeLabel(snoozedUntil, now)}
      </span>
    ) : status === "working" ? null : (
      formatAge(timestamp, now)
    );

  const action = isSnoozed
    ? { label: "Wake thread now", icon: "lucide:alarm-clock-off", run: () => onUnsnooze(session) }
    : isSettled
      ? { label: "Un-settle thread", icon: "lucide:undo-2", run: () => onUnsettle(session) }
      : { label: "Settle thread", icon: "lucide:check", run: () => onSettle(session) };

  const shortcutBadgeTitle = shortcutBadge ? `Switch with ${shortcutBadge}` : "";
  const snoozePresets = resolveSnoozePresets(snoozeMenuNow);
  const projectIcon = projectIconKind && projectIconValue ? { kind: projectIconKind, value: projectIconValue } : null;

  const rightSlot = (
    <span className="relative ml-auto flex h-5 min-w-7 shrink-0 items-center justify-end">
      {timeLabel !== null && (
        <span className="text-[11px] tabular-nums text-muted-foreground/60 transition-opacity group-hover:opacity-0 group-focus-visible:opacity-0 group-has-[:focus-visible]:opacity-0">
          {timeLabel}
        </span>
      )}
      <button
        type="button"
        title={action.label}
        aria-label={action.label}
        data-testid={`thread-sidebar-action-${isSnoozed ? "wake" : isSettled ? "unsettle" : "settle"}`}
        onClick={stop(action.run)}
        className={ACTION_CLASS}
      >
        <Icon icon={action.icon} className="size-3.5" />
      </button>
    </span>
  );

  const titleNode = editing ? (
    <Input
      ref={editInputRef}
      value={draftTitle}
      onChange={(event) => setDraftTitle(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
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
  ) : (
    <span className={cn("min-w-0 flex-1 truncate", recede ? "font-normal" : "font-medium")}>
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
  );

  const popoverStatus =
    section === "snoozed" && typeof snoozedUntil === "number"
      ? {
          label: `Snoozed — wakes in ${formatWakeLabel(snoozedUntil, now)}`,
          className: "text-sky-600 dark:text-sky-300",
        }
      : section === "settled" && status === "ready"
        ? { label: "Settled", className: "text-muted-foreground" }
        : POPOVER_STATUS[status];

  const row = (
    <div
      role="button"
      tabIndex={0}
      aria-current={isSelected ? "page" : undefined}
      aria-label={[session.title || "Untitled session", statusStyle?.label, projectName].filter(Boolean).join(", ")}
      data-testid="thread-sidebar-row"
      data-session-id={session.id}
      data-section={section}
      data-status={status}
      data-selected={String(isSelected)}
      data-nav-selected={String(isNavSelected)}
      data-recede={recede ? "true" : undefined}
      data-editing={editing ? "true" : undefined}
      onClick={() => onSelect(session)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(session);
        }
      }}
      className={cn(
        "group relative flex w-full cursor-default flex-col gap-0.5 rounded-lg px-2 py-1.5 text-left text-[13px] outline-none transition-colors duration-150 focus-visible:ring-1 focus-visible:ring-primary/40",
        editing
          ? "bg-sidebar-row-active/40"
          : isSelected
            ? "bg-sidebar-row-active/60 text-foreground"
            : isNavSelected
              ? "bg-sidebar-row-hover text-foreground"
              : recede
                ? "text-sidebar-foreground/70 hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-row-hover",
      )}
    >
      {projectName !== null && (
        <span data-testid="thread-sidebar-row-project" className="flex h-5 min-w-0 items-center gap-1.5">
          <span className={cn("flex shrink-0 transition-opacity", !isSelected && "opacity-60 group-hover:opacity-100")}>
            <ProjectIcon name={projectName} icon={projectIcon} />
          </span>
          <span className="min-w-0 truncate text-[11px] font-medium text-muted-foreground">{projectName}</span>
          {rightSlot}
        </span>
      )}
      <span className="flex h-5 min-w-0 items-center gap-1.5">
        <span
          className={cn(
            "flex shrink-0 items-center transition-opacity",
            !isSelected && "opacity-50 grayscale group-hover:opacity-100 group-hover:grayscale-0",
          )}
        >
          {agent ? (
            <AgentAvatar agent={agent} className="size-3.5" />
          ) : (
            <Icon icon="lucide:message-square" className="size-3.5 text-muted-foreground/60" />
          )}
        </span>
        {titleNode}
        {!editing && (
          <>
            {session.isPinned && section !== "pinned" && (
              <Icon icon="lucide:pin" className="size-3 shrink-0 text-muted-foreground/60" aria-label="Pinned" />
            )}
            {statusNode}
            {shortcutBadge && (
              <span
                data-testid="sidebar-session-shortcut-badge"
                className="shortcut-badge shrink-0"
                title={shortcutBadgeTitle}
                aria-label={shortcutBadgeTitle}
              >
                {shortcutBadge}
              </span>
            )}
            {projectName === null && rightSlot}
          </>
        )}
      </span>
      {branch && !editing && (
        <span
          data-testid="thread-sidebar-row-branch"
          className="flex h-4 min-w-0 items-center gap-1 pl-5 text-[11px] text-muted-foreground/70"
        >
          <Icon icon="lucide:git-branch" className="size-3 shrink-0" />
          <span className="truncate">{branch}</span>
        </span>
      )}
    </div>
  );

  return (
    <TooltipPrimitive.Root>
      <ContextMenu onOpenChange={(open) => open && setSnoozeMenuNow(new Date())}>
        {/* A div trigger: rows contain real buttons (settle, woke), which HTML
            forbids inside <button>. The row itself is focusable/activatable; the
            details tooltip trigger is composed onto the same element. */}
        <ContextMenuTrigger render={<TooltipPrimitive.Trigger delay={500} closeDelay={0} render={row} />} />
        <ContextMenuContent>
          <ContextMenuItem onClick={() => onTogglePin(session)}>
            <Icon icon={session.isPinned ? "lucide:pin-off" : "lucide:pin"} className="size-3.5" />
            {session.isPinned ? "Unpin" : "Pin"}
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              setDraftTitle(session.title);
              setEditing(true);
            }}
          >
            <Icon icon="lucide:pencil" className="size-3.5" />
            Rename
          </ContextMenuItem>
          {projectName !== null && (
            <ContextMenuItem onClick={() => onOpenProjectSettings(session)}>
              <Icon icon="lucide:settings-2" className="size-3.5" />
              Project settings
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          {isSnoozed ? (
            <ContextMenuItem onClick={() => onUnsnooze(session)}>
              <Icon icon="lucide:alarm-clock-off" className="size-3.5" />
              Wake now
            </ContextMenuItem>
          ) : canSnooze(session) ? (
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <Icon icon="lucide:alarm-clock" className="size-3.5" />
                Snooze
              </ContextMenuSubTrigger>
              <ContextMenuSubContent>
                {snoozePresets.map((preset) => (
                  <ContextMenuItem key={preset.id} onClick={() => onSnooze(session, preset.until)}>
                    <span className="flex-1">{preset.label}</span>
                    <span className="ml-4 text-[11px] text-muted-foreground">{preset.whenLabel}</span>
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
          ) : null}
          {isSettled ? (
            <ContextMenuItem onClick={() => onUnsettle(session)}>
              <Icon icon="lucide:undo-2" className="size-3.5" />
              Un-settle
            </ContextMenuItem>
          ) : (
            <ContextMenuItem onClick={() => onSettle(session)}>
              <Icon icon="lucide:check" className="size-3.5" />
              Settle
            </ContextMenuItem>
          )}
          {session.status !== "working" && (
            <ContextMenuItem onClick={() => onArchive(session)}>
              <Icon icon="lucide:archive" className="size-3.5" />
              Archive
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() => onRequestDelete(session)}
            className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
          >
            <Icon icon="lucide:trash-2" className="size-3.5" />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {!editing && (
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Positioner side="right" align="start" sideOffset={8} className="isolate z-50">
            <TooltipPrimitive.Popup
              data-testid="thread-sidebar-row-popover"
              className="z-50 flex min-w-48 max-w-72 flex-col gap-1.5 rounded-xl border border-border bg-popover px-3 py-2.5 text-xs text-popover-foreground shadow-lg data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0"
            >
              <p className="text-[13px] font-semibold leading-snug">{session.title || "Untitled session"}</p>
              {projectName !== null && (
                <span className="flex items-center gap-2">
                  <ProjectIcon name={projectName} icon={projectIcon} />
                  <span className="truncate">{projectName}</span>
                </span>
              )}
              <span className="flex items-center gap-2 text-muted-foreground">
                <Icon icon="lucide:server" className="size-4 shrink-0" />
                <span className="truncate">{machineLabel}</span>
              </span>
              {branch && (
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Icon icon="lucide:git-branch" className="size-4 shrink-0" />
                  <span className="truncate">{branch}</span>
                </span>
              )}
              {modelLabel && (
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Icon icon="lucide:box" className="size-4 shrink-0" />
                  <span className="truncate">{modelLabel}</span>
                </span>
              )}
              {popoverStatus && (
                <span className={cn("flex items-center gap-2", popoverStatus.className)}>
                  <Icon icon="lucide:circle-alert" className="size-4 shrink-0" />
                  <span>{popoverStatus.label}</span>
                </span>
              )}
            </TooltipPrimitive.Popup>
          </TooltipPrimitive.Positioner>
        </TooltipPrimitive.Portal>
      )}
    </TooltipPrimitive.Root>
  );
}

export default memo(ThreadSidebarRow);
