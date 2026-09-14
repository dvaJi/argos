import type { ReactNode } from "react";
import { Icon } from "@iconify/react";

interface ThreadSectionProps {
  label: string;
  /** Shown next to collapsible labels; defaults to 0 when omitted. */
  count?: number;
  /** Render a collapsible shelf header (chevron + count) instead of a plain label. */
  collapsible?: boolean;
  expanded?: boolean;
  onToggleExpanded?: () => void;
  toggleTestId?: string;
  children: ReactNode;
  /** Renders a "Show more (N)" row below the children when remaining > 0. */
  showMore?: {
    remaining: number;
    onClick: () => void;
    testId?: string;
  };
}

/**
 * Section shell for the thread sidebar (label, optional collapsible toggle,
 * optional show-more row). Children are responsible for the row list so the
 * caller keeps control of row props; this only dedupes the section chrome
 * that was previously duplicated across Pinned/Active/Snoozed/Settled.
 */
export default function ThreadSection({
  label,
  count = 0,
  collapsible = false,
  expanded = true,
  onToggleExpanded,
  toggleTestId,
  children,
  showMore,
}: ThreadSectionProps) {
  const header = collapsible ? (
    <button
      type="button"
      data-testid={toggleTestId}
      onClick={onToggleExpanded}
      aria-expanded={expanded}
      className="flex items-center gap-1 rounded-md px-1 text-[11px] font-medium text-muted-foreground/70 transition-colors hover:text-foreground"
    >
      <Icon icon={expanded ? "lucide:chevron-down" : "lucide:chevron-right"} className="size-3" />
      {label}
      <span className="tabular-nums">{count}</span>
    </button>
  ) : (
    <p className="px-1 text-[11px] font-medium text-muted-foreground/70">{label}</p>
  );
  return (
    <section aria-label={`${label} threads`} className="flex min-h-0 flex-col gap-1">
      {header}
      {(!collapsible || expanded) && children}
      {showMore && showMore.remaining > 0 && (
        <button
          type="button"
          data-testid={showMore.testId}
          onClick={showMore.onClick}
          className="rounded-md px-2 py-1 text-left text-[11px] font-medium text-muted-foreground/70 transition-colors hover:bg-sidebar-row-hover hover:text-foreground"
        >
          Show more ({showMore.remaining})
        </button>
      )}
    </section>
  );
}
