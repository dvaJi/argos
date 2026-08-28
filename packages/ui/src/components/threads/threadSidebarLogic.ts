import type { UISession } from "#/stores/ui/session";

/**
 * Pure thread-sidebar logic, mirroring t3code's Sidebar.logic.ts split
 * (docs/features/thread-sidebar-t3-parity): status/pill resolution, section
 * partitioning, sorting, search matching, and label formatting. No React, no
 * store, no side effects — everything here is trivially testable.
 */

export type ThreadStatus = "approval" | "failed" | "working" | "unseen" | "ready";

export interface ThreadPill {
  label: string;
  icon: string;
  /** Tailwind classes for the pill container. */
  className: string;
  /** Animate the pill (active states) — respects motion-reduce downstream. */
  pulse: boolean;
}

export function isSidebarVisibleSession(session: Pick<UISession, "isDraft" | "sessionKind">): boolean {
  return !session.isDraft && (session.sessionKind ?? "regular") === "regular";
}

/**
 * Status priority follows t3code's resolveSidebarThreadStatus: attention states
 * (approval/failed) outrun activity, activity outruns unseen completion.
 */
export function resolveThreadStatus(session: Pick<UISession, "status">): ThreadStatus {
  switch (session.status) {
    case "blocked":
      return "approval";
    case "error":
      return "failed";
    case "working":
      return "working";
    case "new_results":
      return "unseen";
    default:
      return "ready";
  }
}

export function resolveThreadPill(status: ThreadStatus): ThreadPill | null {
  switch (status) {
    case "approval":
      return {
        label: "Pending approval",
        icon: "lucide:circle-alert",
        className: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
        pulse: true,
      };
    case "failed":
      return {
        label: "Failed",
        icon: "lucide:circle-x",
        className: "bg-red-500/10 text-red-600 dark:text-red-400",
        pulse: false,
      };
    case "working":
      return {
        label: "Working",
        icon: "lucide:circle-dashed",
        className: "bg-primary/10 text-primary",
        pulse: true,
      };
    case "unseen":
      // t3code: emerald "Completed" pill while the completion is unseen.
      return {
        label: "Completed",
        icon: "lucide:circle-check",
        className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        pulse: false,
      };
    default:
      return null;
  }
}

export interface ThreadSections {
  pinned: UISession[];
  active: UISession[];
  snoozed: UISession[];
  settled: UISession[];
}

export interface PartitionHelpers {
  /** settledAt per session id (ms); unknown/legacy time = 0. */
  settledAtById: Record<string, number>;
  /** Absolute wake time per snoozed session id (ms). */
  snoozedUntilById: Record<string, number>;
  now: number;
}

/**
 * t3code partition semantics: pinned is an explicit section; active is the
 * default lifecycle state (everything not pinned/snoozed/settled); snoozed
 * hides threads until their wake time; settled sorts by settled time, newest
 * first (unknown times fall back to updatedAt so migrated data keeps a stable
 * order). Live sessions always participate in Active — a working thread can
 * never render as Settled.
 */
export function partitionThreads(sessions: readonly UISession[], helpers: PartitionHelpers): ThreadSections {
  const visible = sessions.filter(isSidebarVisibleSession);
  const sections: ThreadSections = { pinned: [], active: [], snoozed: [], settled: [] };

  for (const session of visible) {
    const snoozedUntil = helpers.snoozedUntilById[session.id];
    if (typeof snoozedUntil === "number" && snoozedUntil > helpers.now) {
      sections.snoozed.push(session);
      continue;
    }
    const settledAt = helpers.settledAtById[session.id];
    const isSettled = typeof settledAt === "number" && settledAt > 0;
    if (session.isPinned) {
      sections.pinned.push(session);
    } else if (isSettled && session.status !== "working") {
      sections.settled.push(session);
    } else {
      // Active is the default state; working threads resurface even if a
      // stale settled flag exists.
      sections.active.push(session);
    }
  }

  sections.pinned.sort(compareCreatedDesc);
  sections.active.sort(compareCreatedDesc);
  sections.snoozed.sort((a, b) => (helpers.snoozedUntilById[a.id] ?? 0) - (helpers.snoozedUntilById[b.id] ?? 0));
  sections.settled.sort((a, b) => {
    const aAt = helpers.settledAtById[a.id] || a.updatedAt;
    const bAt = helpers.settledAtById[b.id] || b.updatedAt;
    return bAt - aAt;
  });
  return sections;
}

function compareCreatedDesc(a: UISession, b: UISession): number {
  return b.createdAt - a.createdAt;
}

export interface TitleSegment {
  text: string;
  match: boolean;
}

/** Split a title into matched/unmatched segments for <mark>-style highlight. */
export function highlightSegments(title: string, query: string): TitleSegment[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [{ text: title, match: false }];
  const segments: TitleSegment[] = [];
  let cursor = 0;
  const haystack = title.toLowerCase();
  while (cursor < title.length) {
    const index = haystack.indexOf(normalized, cursor);
    if (index === -1) {
      segments.push({ text: title.slice(cursor), match: false });
      break;
    }
    if (index > cursor) {
      segments.push({ text: title.slice(cursor, index), match: false });
    }
    segments.push({ text: title.slice(index, index + normalized.length), match: true });
    cursor = index + normalized.length;
  }
  return segments.filter((segment) => segment.text.length > 0);
}

export function matchesTitle(session: Pick<UISession, "title">, query: string): boolean {
  return session.title.toLowerCase().includes(query.trim().toLowerCase());
}

/** Case-insensitive title filter that preserves the incoming (section) order. */
export function filterByTitle(sessions: readonly UISession[], query: string): UISession[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [...sessions];
  return sessions.filter((session) => session.title.toLowerCase().includes(normalized));
}

export function formatAge(timestamp: number, now: number): string {
  const diffMs = Math.max(0, now - timestamp);
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}

/** t3code's formatWorkingDurationLabel: Xs / Xm / Xh Ym. */
export function formatWorkingElapsed(since: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - since) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

/** Countdown label for snoozed rows: "in 59m" / "in 2h 05m". */
export function formatWakeCountdown(until: number, now: number): string {
  const ms = Math.max(0, until - now);
  const minutes = Math.ceil(ms / 60000);
  if (minutes <= 1) return "in <1m";
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `in ${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
}
