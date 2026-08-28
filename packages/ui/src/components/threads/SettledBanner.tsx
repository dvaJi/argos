import { Icon } from "@iconify/react";
import { unsettleSession, useIsSessionSettled } from "#/stores/ui/threadSidebar";

interface SettledBannerProps {
  sessionId: string | null | undefined;
}

/**
 * Banner that renders above the chat input when the open thread is in the
 * "settled" state. Two affordances:
 *  - Click "Un-settle" to promote the thread back to Active in the sidebar.
 *  - Sending a message in the chat input also unsettles (handled in
 *    `ChatPage.onSubmit` / `onCommandSubmit`).
 */
export default function SettledBanner({ sessionId }: SettledBannerProps) {
  const isSettled = useIsSessionSettled(sessionId);
  if (!sessionId || !isSettled) return null;

  const handleUnsettle = () => {
    unsettleSession(sessionId);
  };

  return (
    <div
      data-testid="settled-banner"
      className="mx-auto mt-2 flex w-full max-w-2xl items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs"
    >
      <Icon icon="lucide:archive" className="mt-0.5 size-3.5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">This thread is settled</p>
        <p className="mt-0.5 text-muted-foreground">Sending a message moves it back to Active in the sidebar.</p>
      </div>
      <button
        type="button"
        data-testid="settled-banner-unsettle"
        onClick={handleUnsettle}
        className="shrink-0 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary transition-colors duration-150 hover:bg-primary/20"
      >
        Un-settle
      </button>
    </div>
  );
}
