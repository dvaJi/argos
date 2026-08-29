import { useState, useEffect } from "react";
import { Icon } from "@iconify/react";
import { Tooltip, TooltipContent, TooltipTrigger } from "#shadcn/components/ui/tooltip";
import type { ConnectionState } from "@argos/shared-contracts/connection";
import { createConnectionClient } from "#api/ConnectionClient";
type IndicatorStatus = "connected" | "connecting" | "disconnected" | "error";
const STATUS_CONFIG: Record<
  IndicatorStatus,
  {
    color: string;
    icon: string;
    label: string;
  }
> = {
  connected: {
    color: "bg-green-500",
    icon: "lucide:wifi",
    label: "Connected",
  },
  connecting: {
    color: "bg-yellow-500",
    icon: "lucide:wifi",
    label: "Connecting...",
  },
  disconnected: {
    color: "bg-gray-400",
    icon: "lucide:wifi-off",
    label: "Disconnected",
  },
  error: {
    color: "bg-red-500",
    icon: "lucide:wifi-off",
    label: "Connection error",
  },
};
function deriveStatus(state: ConnectionState): IndicatorStatus {
  if (state.connected) return "connected";
  if (state.lastError) return "error";
  if (state.url) return "connecting";
  return "disconnected";
}
function truncate(value: string, max = 36): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}
export default function ConnectionIndicator() {
  const client = createConnectionClient();
  const [state, setState] = useState<ConnectionState>(() => {
    try {
      return client.getState();
    } catch {
      return {
        mode: "local",
        url: null,
        connected: false,
        lastError: null,
      };
    }
  });
  useEffect(() => {
    return client.onStateChange(setState);
  }, [client]);
  const status = deriveStatus(state);
  const config = STATUS_CONFIG[status];
  const tooltipLabel =
    state.mode === "local"
      ? "This computer"
      : state.url
        ? `Remote: ${state.url}${state.lastError ? ` — ${state.lastError}` : ""}`
        : "Remote (no URL configured)";
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            className="flex items-center justify-center w-9 h-9 cursor-default"
            aria-label={tooltipLabel}
            data-testid="connection-indicator"
            data-mode={state.mode}
            data-status={status}
          />
        }
      >
        <span className={`w-2.5 h-2.5 rounded-full ${config.color}`} />
      </TooltipTrigger>
      <TooltipContent side="right">
        <div className="flex items-center gap-2">
          <Icon icon={config.icon} className="w-3.5 h-3.5" />
          <span>{state.mode === "local" ? "This computer" : `${config.label} — ${truncate(state.url ?? "")}`}</span>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
