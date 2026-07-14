import { Icon } from "@iconify/react";
import { RECONNECT_EXHAUSTED_ERROR } from "@argos/shared-contracts/connection";
import { useRuntimeConnectionState } from "#/composables/useRuntimeConnectionState";

export default function DaemonConnectionBanner({ placement = "inline" }: { placement?: "inline" | "overlay" }) {
  const state = useRuntimeConnectionState();

  if (state.connected || !state.url) return null;

  const retryStopped = state.lastError === RECONNECT_EXHAUSTED_ERROR;
  const reconnectAttempt = Math.max(state.reconnectAttempt ?? 1, 1);
  const maxReconnectAttempts = state.maxReconnectAttempts ?? 10;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="daemon-connection-banner"
      className={`window-no-drag-region flex min-h-8 shrink-0 items-center justify-center gap-2 border-b border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive${
        placement === "overlay" ? " fixed inset-x-0 top-9 z-50 shadow-sm backdrop-blur-sm" : ""
      }`}
    >
      <Icon
        icon={retryStopped ? "lucide:triangle-alert" : "lucide:loader-circle"}
        className={`size-3.5 shrink-0${retryStopped ? "" : " animate-spin"}`}
        aria-hidden="true"
      />
      <span className="font-medium">{retryStopped ? "Daemon unavailable." : "Daemon disconnected."}</span>
      <span className="text-destructive/75">
        {retryStopped
          ? "Reconnect failed. Restart Argos or reconnect the workspace."
          : `Reconnecting automatically… Attempt ${reconnectAttempt}/${maxReconnectAttempts}`}
      </span>
    </div>
  );
}
