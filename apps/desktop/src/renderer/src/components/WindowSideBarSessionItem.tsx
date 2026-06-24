import { useMemo } from "react";
import { Icon } from "@iconify/react";
import type { UISession } from "@/stores/ui/session";

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
    <div
      data-testid="sidebar-session-item"
      className={`session-item no-drag flex w-full select-none items-center rounded-lg px-2.5 text-left transition-colors duration-150${
        active ? " bg-accent text-accent-foreground" : " text-foreground/80 hover:bg-accent/50"
      }${heroHidden ? " is-hero-hidden" : ""}`}
      data-pin-fx={pinFeedbackMode ?? undefined}
      data-pin-placeholder={heroPlaceholder ? "true" : undefined}
      data-pin-state={pinState}
      data-active={String(active)}
      data-session-region={region}
      data-session-id={session.id}
      onClick={() => onSelect(session)}
    >
      <button
        type="button"
        className={`session-action-button pin-button flex h-7 w-7 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40${
          session.isPinned ? " pin-button--active" : " pin-button--idle"
        }`}
        title={pinActionLabel}
        aria-label={pinActionLabel}
        aria-pressed={session.isPinned}
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin(session);
        }}
      >
        <Icon icon="lucide:pin" className="pin-button__icon h-4 w-4" />
      </button>

      <div className="session-content flex min-w-0 flex-1 items-center gap-1.5">
        <span className={`session-title min-w-0 flex-1 text-sm${isWorking ? " session-title--loading" : ""}`}>
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
        className="right-button flex items-center"
        data-shortcut-badge-visible={shortcutBadgeVisible ? "true" : undefined}
      >
        {shortcutBadgeVisible && shortcutBadgeLabel ? (
          <span
            data-testid="sidebar-session-shortcut-badge"
            className="shortcut-badge"
            title={shortcutBadgeTitle}
            aria-label={shortcutBadgeTitle}
          >
            {shortcutBadgeLabel}
          </span>
        ) : (
          <button
            type="button"
            className="session-action-button right-button__action flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-destructive/30"
            title={deleteActionLabel}
            aria-label={deleteActionLabel}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(session);
            }}
          >
            <Icon icon="lucide:trash-2" className="h-4 w-4" />
          </button>
        )}
      </span>
    </div>
  );
}
