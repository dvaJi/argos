import { useState } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { RECONNECT_EXHAUSTED_ERROR } from "@argos/shared-contracts/connection";
import { useRuntimeConnectionState } from "#/composables/useRuntimeConnectionState";
import { retryRuntimeConnection } from "#api/runtime";

export default function DaemonConnectionBanner({ placement = "inline" }: { placement?: "inline" | "overlay" }) {
  const state = useRuntimeConnectionState();
  const [retrying, setRetrying] = useState(false);

  if (state.connected) return null;

  const retryStopped = state.lastError === RECONNECT_EXHAUSTED_ERROR;
  const noBridge = !state.url;
  const reconnectAttempt = Math.max(state.reconnectAttempt ?? 1, 1);
  const maxReconnectAttempts = state.maxReconnectAttempts ?? 10;

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await retryRuntimeConnection();
    } finally {
      setRetrying(false);
    }
  };

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
        icon={retryStopped || noBridge ? "lucide:triangle-alert" : "lucide:loader-circle"}
        className={`size-3.5 shrink-0${retryStopped || noBridge ? "" : " animate-spin"}`}
        aria-hidden="true"
      />
      <span className="font-medium">
        {retryStopped ? "Daemon unavailable." : noBridge ? "Daemon connection lost." : "Daemon disconnected."}
      </span>
      <span className="text-destructive/75">
        {retryStopped
          ? "Reconnecting automatically… Retry manually if this persists."
          : noBridge
            ? "The daemon is not reachable yet."
            : `Reconnecting automatically… Attempt ${reconnectAttempt}/${maxReconnectAttempts}`}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-6 border-destructive/40 px-2 text-[11px] text-destructive hover:bg-destructive/10"
        disabled={retrying}
        onClick={() => void handleRetry()}
      >
        <Icon
          icon={retrying ? "lucide:loader-circle" : "lucide:refresh-cw"}
          className={`size-3${retrying ? " animate-spin" : ""}`}
        />
        {retrying ? "Retrying…" : "Retry"}
      </Button>
    </div>
  );
}
