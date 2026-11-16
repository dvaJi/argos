import { useEffect, useState } from "react";
import { ChevronDownIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "#shadcn/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "#shadcn/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#shadcn/components/ui/table";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "#shadcn/components/ui/empty";
import { createUsageClient } from "#api/UsageClient";
import type { UsageLimitProvider, UsageStatsOutput, UsageWindow } from "@argos/shared-contracts/routes";
import { DailyUsageChart } from "#/components/usage/DailyUsageChart";
import { UsageLimits } from "#/components/usage/UsageLimits";
import {
  currency,
  formatPercent,
  formatTokens,
  harnessLabel,
  providerColor,
} from "#/components/usage/usagePresentation";
import ModelIcon from "#/components/icons/ModelIcon";
import { themeStore } from "#/stores/theme";
import "#/components/usage/usage-motion.css";

type Metric = "cost" | "tokens" | "limits";

const WINDOWS: Array<{ id: UsageWindow; label: string }> = [
  { id: "past24h", label: "Past 24h" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
];

const METRICS: Array<{ id: Metric; label: string }> = [
  { id: "cost", label: "Cost" },
  { id: "tokens", label: "Tokens" },
  { id: "limits", label: "Limits" },
];

const ALL = "all";

/** Narrows the window-scoped server response to one provider (or all). */
function deriveView(data: UsageStatsOutput, provider: string | undefined) {
  if (provider === undefined) {
    return {
      chartSeries: data.dailySeries,
      summary: data.summary,
      services: data.services,
      models: data.modelBreakdown,
    };
  }
  const services = data.services.filter((service) => service.id === provider);
  const points = data.serviceDailySeries.find((series) => series.serviceId === provider)?.points ?? [];
  const sum = (pick: (point: (typeof points)[number]) => number) => points.reduce((total, p) => total + pick(p), 0);
  const inputTokens = sum((p) => p.inputTokens);
  const cachedInputTokens = sum((p) => p.cachedInputTokens);
  const costUsd = services.reduce((total, service) => total + (service.costUsd ?? 0), 0);
  const summary: UsageStatsOutput["summary"] = {
    ...data.summary,
    rawTokenCostUsd: costUsd > 0 ? costUsd : null,
    processedTokens: services.reduce((total, service) => total + service.totalTokens, 0),
    cachedInputTokens,
    uncachedInputTokens: Math.max(inputTokens - cachedInputTokens, 0),
    outputTokens: sum((p) => p.outputTokens),
    // Not derivable per provider client-side.
    reasoningTokens: 0,
    cacheSavingsUsd: null,
    activeDays: points.filter((p) => p.totalTokens > 0).length,
    messageCount: services.reduce((total, service) => total + service.messageCount, 0),
    costQuality: { reportedShare: null, estimatedShare: null, unpricedTurns: 0 },
  };
  return {
    chartSeries: points,
    summary,
    services: services.map((service) => ({ ...service, costShare: 1 })),
    models: data.modelBreakdown.filter((item) => item.providerId === provider),
  };
}

function HeaderMenu<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (next: T) => void;
}) {
  const current = options.find((option) => option.id === value)?.label ?? value;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="flex items-center gap-1 rounded-md px-1.5 py-1 text-sm font-medium text-foreground hover:bg-accent"
          />
        }
      >
        {current}
        <ChevronDownIcon className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-40">
        <DropdownMenuRadioGroup value={value} onValueChange={(next) => onChange(next as T)}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.id} value={option.id}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MetricSwitch({ value, onChange }: { value: Metric; onChange: (next: Metric) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-muted/60 p-0.5" role="tablist">
      {METRICS.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={value === item.id}
          onClick={() => onChange(item.id)}
          className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${value === item.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function Totals({ summary }: { summary: UsageStatsOutput["summary"] }) {
  const items = [
    { label: "Processed", value: formatTokens(summary.processedTokens) },
    { label: "Cached input", value: formatTokens(summary.cachedInputTokens) },
    { label: "Uncached input", value: formatTokens(summary.uncachedInputTokens) },
    { label: "Output", value: formatTokens(summary.outputTokens) },
    {
      label: "Cache savings",
      value: summary.cacheSavingsUsd !== null ? currency.format(summary.cacheSavingsUsd) : "—",
    },
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-5">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="truncate text-xs text-muted-foreground">{item.label}</dt>
          <dd className="mt-0.5 text-lg font-semibold tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SpendView({
  view,
  metric,
  dataKey,
}: {
  view: ReturnType<typeof deriveView>;
  metric: "cost" | "tokens";
  dataKey: number;
}) {
  const { summary, services, models, chartSeries } = view;
  const totalTokens = services.reduce((total, service) => total + service.totalTokens, 0);
  const rankedServices = services.toSorted((a, b) =>
    metric === "cost" ? (b.costUsd ?? 0) - (a.costUsd ?? 0) : b.totalTokens - a.totalTokens,
  );
  const rankedModels = models.toSorted((a, b) =>
    metric === "cost" ? (b.costUsd ?? 0) - (a.costUsd ?? 0) : b.totalTokens - a.totalTokens,
  );
  const hasChartActivity = chartSeries.some((point) => point.totalTokens > 0 || (point.costUsd ?? 0) > 0);
  const estimatedShare = summary.costQuality.estimatedShare;

  return (
    <div className="usage-reveal flex flex-col gap-10" key={`spend-${dataKey}-${metric}`}>
      <section className="grid gap-8 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <div>
            <p className="text-4xl font-semibold tabular-nums tracking-tight">
              {metric === "cost"
                ? summary.rawTokenCostUsd !== null
                  ? currency.format(summary.rawTokenCostUsd)
                  : "—"
                : formatTokens(summary.processedTokens)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground" data-testid="usage-cost-quality">
              {summary.messageCount.toLocaleString()} messages · {summary.activeDays} active day
              {summary.activeDays === 1 ? "" : "s"}
              {metric === "cost" && " · API-rate estimate"}
              {metric === "cost" && estimatedShare !== null && estimatedShare > 0 && estimatedShare < 1
                ? ` (${formatPercent(estimatedShare)} estimated)`
                : ""}
            </p>
          </div>

          {rankedServices.map((service) => {
            const share =
              metric === "cost" ? service.costShare : totalTokens > 0 ? service.totalTokens / totalTokens : 0;
            return (
              <div key={service.id} className="flex flex-col gap-0.5">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="flex min-w-0 items-center gap-2 text-sm">
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: providerColor(service.id) }}
                    />
                    <ModelIcon modelId={service.id} customClass="h-4 w-4 shrink-0" isDark={themeStore.state.isDark} />
                    <span className="truncate">{service.label}</span>
                  </span>
                  <span className="shrink-0 text-sm font-medium tabular-nums">
                    {metric === "cost" ? currency.format(service.costUsd ?? 0) : formatTokens(service.totalTokens)}
                  </span>
                </div>
                <p className="pl-4 text-xs text-muted-foreground">
                  {formatPercent(share)} of {metric === "cost" ? "cost" : "tokens"} ·{" "}
                  {metric === "cost"
                    ? `${formatTokens(service.totalTokens)} tokens`
                    : currency.format(service.costUsd ?? 0)}
                </p>
              </div>
            );
          })}
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <h2 className="text-sm font-medium">Daily {metric === "cost" ? "cost" : "processed tokens"}</h2>
          {hasChartActivity ? (
            <DailyUsageChart points={chartSeries} mode={metric} />
          ) : (
            <div className="flex h-72 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
              No activity in this window
            </div>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Totals</h2>
        <Totals summary={summary} />
      </section>

      {rankedModels.length > 0 && (
        <section className="flex flex-col gap-1">
          <h2 className="text-sm font-medium">By model</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead>Harness</TableHead>
                <TableHead className="text-right">{metric === "cost" ? "Cost" : "Tokens"}</TableHead>
                <TableHead className="text-right">{metric === "cost" ? "Tokens" : "Cost"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rankedModels.map((item) => (
                // Same model can appear under multiple harnesses; providerId+id is unique.
                <TableRow key={`${item.providerId}:${item.id}`}>
                  <TableCell>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <ModelIcon modelId={item.id} customClass="h-4 w-4 shrink-0" isDark={themeStore.state.isDark} />
                      <span className="truncate font-mono text-xs">{item.label}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{harnessLabel(item.providerId)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {metric === "cost" ? currency.format(item.costUsd ?? 0) : formatTokens(item.totalTokens)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {metric === "cost" ? formatTokens(item.totalTokens) : currency.format(item.costUsd ?? 0)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}
    </div>
  );
}

// Process-wide singleton; module scope keeps the effect dependency stable.
const usageClient = createUsageClient();

type LoadResult = { stats: UsageStatsOutput; limits: UsageLimitProvider[] } | { error: string };

async function loadUsage(window: UsageWindow): Promise<LoadResult> {
  try {
    const [stats, limitResult] = await Promise.all([
      usageClient.getStats(window),
      // Limits are best-effort; a failure must not hide cost/token data.
      usageClient.getLimits().catch(() => ({ providers: [] })),
    ]);
    return { stats, limits: limitResult.providers };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load usage" };
  }
}

export default function UsageView() {
  const [window, setWindow] = useState<UsageWindow>("30d");
  const [metric, setMetric] = useState<Metric>("cost");
  const [provider, setProvider] = useState<string>(ALL);
  const [data, setData] = useState<UsageStatsOutput | null>(null);
  const [limits, setLimits] = useState<UsageLimitProvider[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  // Bumped on each load: re-keys the reveal animation. The limits clock only
  // advances on loads, so the page doesn't tick.
  const [reloadKey, setReloadKey] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const applyResult = (result: LoadResult) => {
    if ("error" in result) {
      setError(result.error);
    } else {
      setData(result.stats);
      setLimits(result.limits);
      setNow(Date.now());
      setReloadKey((key) => key + 1);
      setError("");
    }
    setIsLoading(false);
  };

  // Window-change loads are cancellable so a stale response never lands;
  // loading flags are set by the handlers, not synchronously in the effect.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await loadUsage(window);
      if (cancelled) return;
      if ("error" in result) {
        setError(result.error);
      } else {
        setData(result.stats);
        setLimits(result.limits);
        setNow(Date.now());
        setReloadKey((key) => key + 1);
        setError("");
      }
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [window]);

  const reload = async () => {
    setIsLoading(true);
    applyResult(await loadUsage(window));
  };
  const selectWindow = (next: UsageWindow) => {
    setIsLoading(true);
    setWindow(next);
  };

  const providerOptions = [
    { id: ALL, label: "All providers" },
    ...[
      ...(data?.services ?? []).map((service) => ({ id: service.id, label: service.label })),
      ...(limits ?? []).map((item) => ({ id: item.id, label: item.label })),
    ].filter((option, index, all) => all.findIndex((other) => other.id === option.id) === index),
  ];
  const selectedProvider = provider === ALL ? undefined : provider;
  const view = data ? deriveView(data, selectedProvider) : null;
  const visibleLimits = (limits ?? []).filter((item) => selectedProvider === undefined || item.id === selectedProvider);

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-6 lg:p-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <nav className="flex items-center gap-1 text-sm" aria-label="Usage filters">
            <h1 className="pr-1 font-semibold">Usage</h1>
            {metric !== "limits" && (
              <>
                <span className="text-muted-foreground">/</span>
                <HeaderMenu value={window} options={WINDOWS} onChange={selectWindow} />
              </>
            )}
            <span className="text-muted-foreground">/</span>
            <HeaderMenu value={provider} options={providerOptions} onChange={setProvider} />
          </nav>
          <div className="flex items-center gap-2">
            <MetricSwitch value={metric} onChange={setMetric} />
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => void reload()}
              disabled={isLoading}
              aria-label="Refresh usage"
            >
              <RefreshCwIcon className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </header>

        {error && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
            <span className="text-destructive">Could not load usage: {error}</span>
            <Button variant="outline" size="sm" onClick={() => void reload()} disabled={isLoading}>
              Try again
            </Button>
          </div>
        )}

        {isLoading && !data && (
          <div className="h-80 animate-pulse rounded-xl bg-muted/40" aria-label="Loading usage data" />
        )}

        {metric === "limits" && limits && <UsageLimits providers={visibleLimits} now={now} />}

        {metric !== "limits" && view && view.services.length === 0 && !isLoading && (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No usage in this window</EmptyTitle>
              <EmptyDescription>
                Run a conversation with an agent, or pick a wider time range, to see token usage and cost.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {metric !== "limits" && view && view.services.length > 0 && (
          <SpendView view={view} metric={metric} dataKey={reloadKey} />
        )}
      </div>
    </div>
  );
}
