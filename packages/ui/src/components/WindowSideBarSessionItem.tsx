import { useMemo } from "react";
import { Icon } from "@iconify/react";
import type { UISession } from "#/stores/ui/session";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#shadcn/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "#shadcn/components/ui/context-menu";

type PinFeedbackMode = "pinning" | "unpinning";
type SessionItemRegion = "pinned" | "grouped";
type SessionStatusIcon = {
  className: string;
  icon: string;
} | null;

interface WindowSideBarSessionItemProps {
  session: UISession;
  active: boolean;
  region: SessionItemRegion;
  heroHidden?: boolean;
  heroPlaceholder?: boolean;
  forcePinDocked?: boolean;
  pinFeedbackMode?: PinFeedbackMode | null;
  searchQuery?: string;
  shortcutBadgeLabel?: string | null;
  shortcutBadgeVisible?: boolean;
  onSelect: (session: UISession) => void;
  onTogglePin: (session: UISession) => void;
  onDelete: (session: UISession) => void;
}

export default function WindowSideBarSessionItem({
  session,
  active,
  region,
  heroHidden = false,
  heroPlaceholder = false,
  forcePinDocked = false,
  pinFeedbackMode = null,
  searchQuery,
  shortcutBadgeLabel = null,
  shortcutBadgeVisible = false,
  onSelect,
  onTogglePin,
  onDelete,
}: WindowSideBarSessionItemProps) {
  const pinActionLabel = session.isPinned ? "Unpin" : "Pin";
  const deleteActionLabel = "Delete";
  const isWorking = session.status === "working";

  const pinState: "docked" | "overlay" = useMemo(() => {
    if (forcePinDocked) return "docked";
    if (session.isPinned || pinFeedbackMode === "unpinning") return "docked";
    return "overlay";
  }, [forcePinDocked, session.isPinned, pinFeedbackMode]);

  const statusIcon: SessionStatusIcon = useMemo(() => {
    if (session.status === "completed") return { icon: "lucide:check", className: "text-green-500" };
    if (session.status === "error") return { icon: "lucide:alert-circle", className: "text-destructive" };
    if (session.status === "blocked")
      return { icon: "lucide:clock", className: "text-yellow-500 motion-safe:animate-pulse" };
    if (session.status === "new_results") return { icon: "lucide:circle-dot", className: "text-blue-500" };
    return null;
  }, [session.status]);

  const titleSegments = useMemo(() => {
    const title = session.title;
    const query = searchQuery?.trim();
    if (!query) return [{ text: title, match: false }];

    const lowerTitle = title.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const segments: Array<{ text: string; match: boolean }> = [];
    let searchIndex = 0;
    let matchIndex = lowerTitle.indexOf(lowerQuery);

    while (matchIndex !== -1) {
      if (matchIndex > searchIndex) {
        segments.push({ text: title.slice(searchIndex, matchIndex), match: false });
      }
      segments.push({ text: title.slice(matchIndex, matchIndex + query.length), match: true });
      searchIndex = matchIndex + query.length;
      matchIndex = lowerTitle.indexOf(lowerQuery, searchIndex);
    }

    if (searchIndex < title.length) {
      segments.push({ text: title.slice(searchIndex), match: false });
    }

    return segments.length > 0 ? segments : [{ text: title, match: false }];
  }, [session.title, searchQuery]);

  const shortcutBadgeTitle = shortcutBadgeLabel ? `Switch with ${shortcutBadgeLabel}` : "";

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <div
            data-testid="sidebar-session-item"
            className={`session-item group no-drag flex w-full select-none items-center rounded-lg px-2.5 text-left transition-colors duration-150${
              active ? " bg-accent text-accent-foreground" : " text-foreground/80 hover:bg-accent/50"
            }${heroHidden ? " is-hero-hidden" : ""}`}
            data-pin-fx={pinFeedbackMode ?? undefined}
            data-pin-placeholder={heroPlaceholder ? "true" : undefined}
            data-pin-state={pinState}
            data-active={String(active)}
            data-session-region={region}
            data-session-id={session.id}
            role="button"
            tabIndex={0}
            aria-label={session.title || "Open session"}
            aria-pressed={active}
            onClick={() => onSelect(session)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(session);
              }
            }}
          >
            <div className="session-content flex min-w-0 flex-1 items-center gap-1.5">
              <span
                className={`session-title min-w-0 flex-1 max-h-7 truncate text-sm${
                  isWorking ? " session-title--loading" : ""
                }`}
              >
                <span className="session-title__label">
                  {titleSegments.map((segment, index) =>
                    segment.match ? (
                      <mark key={`${session.id}-${index}`} className="session-title__highlight">
                        {segment.text}
                      </mark>
                    ) : (
                      <span key={`${session.id}-${index}`}>{segment.text}</span>
                    ),
                  )}
                </span>
                {isWorking && (
                  <span aria-hidden="true" className="session-title__sheen">
                    {session.title}
                  </span>
                )}
              </span>

              {statusIcon && (
                <span className="session-status shrink-0">
                  <Icon icon={statusIcon.icon} className={`h-3.5 w-3.5 ${statusIcon.className}`} />
                </span>
              )}
            </div>

            <span
              className="right-button flex shrink-0 items-center gap-0.5"
              data-shortcut-badge-visible={shortcutBadgeVisible ? "true" : undefined}
            >
              {shortcutBadgeVisible && shortcutBadgeLabel && (
                <span
                  data-testid="sidebar-session-shortcut-badge"
                  className="shortcut-badge"
                  title={shortcutBadgeTitle}
                  aria-label={shortcutBadgeTitle}
                >
                  {shortcutBadgeLabel}
                </span>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      type="button"
                      className="session-more-button flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-opacity duration-150 hover:bg-accent/70 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40 group-hover:opacity-100 data-popup-open:opacity-100"
                      title="More options"
                      aria-label="More options"
                      onClick={(e) => e.stopPropagation()}
                    />
                  }
                >
                  <Icon icon="lucide:ellipsis-vertical" className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[9rem]">
                  <DropdownMenuItem variant="default" onClick={() => onTogglePin(session)}>
                    <Icon icon={session.isPinned ? "lucide:pin-off" : "lucide:pin"} className="size-4" />
                    {pinActionLabel}
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={() => onDelete(session)}>
                    <Icon icon="lucide:trash-2" className="size-4" />
                    {deleteActionLabel}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </span>
          </div>
        }
      >
        <ContextMenuContent className="min-w-[9rem]">
          <ContextMenuItem onClick={() => onSelect(session)}>Open</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => onTogglePin(session)}>
            <Icon icon={session.isPinned ? "lucide:pin-off" : "lucide:pin"} className="size-4" />
            {pinActionLabel}
          </ContextMenuItem>
          <ContextMenuItem variant="destructive" onClick={() => onDelete(session)}>
            <Icon icon="lucide:trash-2" className="size-4" />
            {deleteActionLabel}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenuTrigger>
    </ContextMenu>
  );
}
