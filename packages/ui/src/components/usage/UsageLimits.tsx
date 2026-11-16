import { GaugeIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "#shadcn/components/ui/popover";
import type { UsageLimitProvider, UsageLimitWindow } from "@argos/shared-contracts/routes";
import ModelIcon from "#/components/icons/ModelIcon";
import { themeStore } from "#/stores/theme";
import { providerColor } from "./usagePresentation";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

type Pace = "ahead" | "on" | "under";

const PACE: Record<Pace, { label: string; icon: typeof GaugeIcon }> = {
  ahead: { label: "Ahead of pace: spending faster than the window elapses", icon: TrendingUpIcon },
  on: { label: "On pace with the window", icon: GaugeIcon },
  under: { label: "Under pace: headroom left for the rest of the window", icon: TrendingDownIcon },
};

function formatDuration(ms: number): string {
  const remaining = Math.max(0, ms);
  const days = Math.floor(remaining / DAY);
  const hours = Math.floor((remaining % DAY) / HOUR);
  const minutes = Math.floor((remaining % HOUR) / MINUTE);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatResetAt(resetsAt: number, now: number): string {
  const date = new Date(resetsAt);
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const today = new Date(now);
  const tomorrow = new Date(now + DAY);
  if (date.toDateString() === today.toDateString()) return `today at ${time}`;
  if (date.toDateString() === tomorrow.toDateString()) return `tomorrow at ${time}`;
  return `${date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} at ${time}`;
}

function formatObservedAt(observedAt: number, now: number): string {
  const ago = now - observedAt;
  if (ago < MINUTE) return "just now";
  return `${formatDuration(ago)} ago`;
}

/** Share of the window already elapsed (0..1), when the reset clock is known. */
function elapsedShare(window: UsageLimitWindow, now: number): number | null {
  if (window.resetsAt === null || window.windowMinutes === null) return null;
  const length = window.windowMinutes * MINUTE;
  return Math.max(0, Math.min(1, (length - (window.resetsAt - now)) / length));
}

function paceOf(window: UsageLimitWindow, elapsed: number | null): Pace | null {
  if (elapsed === null) return null;
  const gap = window.usedPercent - elapsed * 100;
  if (gap > 5) return "ahead";
  if (gap < -5) return "under";
  return "on";
}

function LimitBar({ provider, window, now }: { provider: UsageLimitProvider; window: UsageLimitWindow; now: number }) {
  const remaining = Math.round(100 - window.usedPercent);
  const elapsed = elapsedShare(window, now);
  // Bars show quota remaining, so even pace sits at the share of time remaining.
  const evenPace = elapsed === null ? null : Math.round((1 - elapsed) * 100);
  const resetsIn = window.resetsAt !== null ? formatDuration(window.resetsAt - now) : null;
  const color = providerColor(provider.id);

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={80}
        closeDelay={80}
        nativeButton={false}
        render={
          <div
            role="img"
            tabIndex={0}
            aria-label={`${window.label}: ${remaining}% left${resetsIn ? `, resets in ${resetsIn}` : ""}`}
            className="relative h-8 min-w-0 flex-1 cursor-default overflow-hidden rounded-md bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        }
      >
        <div
          className="absolute inset-y-0 left-0 rounded-md transition-[width] duration-300"
          style={{ width: `${remaining}%`, backgroundColor: color, opacity: 0.85 }}
        />
        {evenPace !== null && (
          <span
            aria-hidden
            className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-foreground"
            style={{ left: `clamp(2px, ${evenPace}%, calc(100% - 2px))` }}
          />
        )}
        {resetsIn && (
          <span className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded bg-background/80 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-foreground">
            ↻ {resetsIn}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent side="bottom" sideOffset={8} className="w-80 gap-0 rounded-xl border border-border p-0 text-xs">
        <div className="flex items-center gap-2 px-4 pt-3 pb-2">
          <ModelIcon modelId={provider.id} customClass="h-4 w-4 shrink-0" isDark={themeStore.state.isDark} />
          <span className="text-sm font-semibold">{provider.label}</span>
        </div>
        <dl className="grid grid-cols-[6rem_1fr] gap-y-1 border-t border-border px-4 py-2.5">
          {provider.plan && (
            <>
              <dt className="text-muted-foreground">Plan</dt>
              <dd>{provider.plan}</dd>
            </>
          )}
          {provider.observedAt !== null && (
            <>
              <dt className="text-muted-foreground">Updated</dt>
              <dd>{formatObservedAt(provider.observedAt, now)}</dd>
            </>
          )}
        </dl>
        <dl className="grid grid-cols-[6rem_1fr] gap-y-1 border-t border-border px-4 py-2.5">
          <dt className="text-muted-foreground">Left</dt>
          <dd className="tabular-nums">{remaining}%</dd>
          <dt className="text-muted-foreground">Resets</dt>
          <dd>
            {window.resetsAt !== null
              ? `${formatResetAt(window.resetsAt, now)} · in ${resetsIn}`
              : "Window is fresh; resets once used"}
          </dd>
          {evenPace !== null && (
            <>
              <dt className="text-muted-foreground">Even pace</dt>
              <dd className="tabular-nums">{evenPace}% left by now</dd>
            </>
          )}
        </dl>
        {evenPace !== null && (
          <p className="border-t border-border px-4 py-2 text-muted-foreground">
            The line marks where even spending would be.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

function LimitRow({ provider, window, now }: { provider: UsageLimitProvider; window: UsageLimitWindow; now: number }) {
  const remaining = Math.round(100 - window.usedPercent);
  const pace = paceOf(window, elapsedShare(window, now));
  const PaceIcon = pace ? PACE[pace].icon : null;
  return (
    <div className="flex items-center gap-6 rounded-xl border border-border bg-card px-5 py-4">
      <div className="w-36 shrink-0">
        <div className="text-sm font-medium">{window.label}</div>
        <div className="mt-0.5 flex items-baseline gap-1.5">
          <span className="text-3xl font-semibold tabular-nums tracking-tight">{remaining}%</span>
          <span className="text-sm text-muted-foreground">left</span>
          {pace && PaceIcon && (
            <span role="img" aria-label={PACE[pace].label} title={PACE[pace].label} className="text-muted-foreground">
              <PaceIcon className="size-3.5" aria-hidden />
            </span>
          )}
        </div>
      </div>
      <LimitBar provider={provider} window={window} now={now} />
    </div>
  );
}

export function UsageLimits({ providers, now }: { providers: UsageLimitProvider[]; now: number }) {
  if (providers.length === 0) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border text-center">
        <p className="text-sm font-medium">No limits reported</p>
        <p className="text-xs text-muted-foreground">
          Only Codex records its quota windows locally. Run a Codex turn to see them here.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-8">
      {providers.map((provider) => (
        <section key={provider.id} className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ModelIcon modelId={provider.id} customClass="h-4 w-4 shrink-0" isDark={themeStore.state.isDark} />
            {provider.label}
          </h2>
          {provider.windows.map((window) => (
            <LimitRow key={window.id} provider={provider} window={window} now={now} />
          ))}
        </section>
      ))}
      <p className="text-xs text-muted-foreground">
        Quota snapshots come from local agent logs. Claude Code does not record its limits locally yet.
      </p>
    </div>
  );
}
