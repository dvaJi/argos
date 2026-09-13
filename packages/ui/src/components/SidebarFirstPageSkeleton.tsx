/**
 * Skeleton rows shown while the first session page loads. Shared by the
 * original sidebar and the thread-sidebar experiment (extracted from
 * WindowSideBar.tsx so both modes can import it without an import cycle).
 */
export default function SidebarFirstPageSkeleton() {
  return (
    <div className="flex flex-col gap-2 px-3 pb-3" data-testid="window-sidebar-loading-first-page">
      {Array.from({
        length: 6,
      }).map((_, i) => (
        <div key={`session-skeleton-${i}`} className="h-10 rounded-lg bg-muted/50 animate-pulse" />
      ))}
    </div>
  );
}
