import type { CSSProperties } from "react";
import { Icon } from "@iconify/react";
import { Switch } from "#shadcn/components/ui/switch";
import { cn } from "#shadcn/lib/utils";
import type { ChannelMeta } from "./channelMeta";
import "./remote-channels.css";

export type ChannelStatus = "not-configured" | "enabled" | "connected";

const STATUS_LABELS: Record<ChannelStatus, string> = {
  "not-configured": "Not configured",
  enabled: "Enabled",
  connected: "Connected",
};

type ChannelOverviewCardProps = {
  channel: ChannelMeta;
  status: ChannelStatus;
  active: boolean;
  disabled?: boolean;
  busy?: boolean;
  paired?: boolean;
  onToggle: (enabled: boolean) => void;
  onSelect: () => void;
};

export function ChannelOverviewCard({
  channel,
  status,
  active,
  disabled = false,
  busy = false,
  paired = false,
  onToggle,
  onSelect,
}: ChannelOverviewCardProps) {
  const enabled = status !== "not-configured";
  const switchChecked = status === "enabled" || status === "connected";
  const iconStyle = enabled
    ? ({ color: channel.brandColor, backgroundColor: `${channel.brandColor}1A` } as CSSProperties)
    : undefined;

  return (
    <div
      data-testid={`remote-channel-card-${channel.key}`}
      data-active={active}
      className={cn(
        "rc-card group flex cursor-pointer flex-col gap-3 rounded-2xl border bg-card p-4",
        active ? "border-ring/60 ring-1 ring-ring/30 shadow-sm" : "border-border hover:border-foreground/15",
      )}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="rc-icon-tile flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground transition-colors duration-200"
            style={iconStyle}
          >
            <Icon icon={channel.icon} className="size-5" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">{channel.label}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="rc-status-dot" data-enabled={enabled} data-paired={paired} aria-hidden />
              <span data-testid={`remote-channel-status-${channel.key}`}>{STATUS_LABELS[status]}</span>
            </div>
          </div>
        </div>
        <Switch
          checked={switchChecked}
          disabled={disabled || busy}
          size="sm"
          onCheckedChange={onToggle}
          onClick={(event) => event.stopPropagation()}
          aria-label={`Enable ${channel.label}`}
        />
      </div>
      <p className="line-clamp-2 text-pretty text-xs leading-5 text-muted-foreground">{channel.description}</p>
    </div>
  );
}
