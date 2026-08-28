import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "#shadcn/components/ui/button";
import { Badge } from "#shadcn/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "#shadcn/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#shadcn/components/ui/table";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "#shadcn/components/ui/empty";
import { createUsageClient } from "#api/UsageClient";
import type { UsageStatsOutput, UsageWindow } from "@argos/shared-contracts/routes";
import { DailyUsageChart } from "#/components/usage/DailyUsageChart";
import ModelIcon from "#/components/icons/ModelIcon";
import { themeStore } from "#/stores/theme";
import { RefreshIcon, CoinsIcon, CachedIcon, OutputIcon, WalletIcon, LayersIcon } from "#/components/icons/UsageIcons";
import "#/components/usage/usage-motion.css";

const WINDOWS: Array<{ id: UsageWindow; label: string }> = [
  { id: "past24h", label: "Past 24h" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
];

const HARNESS_LABELS: Record<string, string> = {
  codex: "Codex",
  "claude-code": "Claude Code",
  opencode: "OpenCode",
  gemini: "Gemini",
  argos: "Argos agent",
  pi: "Argos agent",
};

function harnessLabel(providerId: string): string {
  return HARNESS_LABELS[providerId] ?? providerId;
}

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const compactTokens = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

function formatTokens(value: number): string {
  return compactTokens.format(value);
}

function Metric({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 border-l border-border pl-4 first:border-l-0 first:pl-0">
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <span className="text-muted-foreground/70">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function CostSourceBadge({ source }: { source: UsageStatsOutput["summary"]["costSource"] }) {
  const label =
    source === "reported"
      ? "Provider-reported"
      : source === "estimated"
        ? "Estimated"
        : source === "mixed"
          ? "Mixed sources"
          : "No cost data";
  return <Badge variant="outline">{label}</Badge>;
}

export default function UsageView() {
  const usageClient = useMemo(() => createUsageClient(), []);
  const [window, setWindow] = useState<UsageWindow>("30d");
  const [data, setData] = useState<UsageStatsOutput | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [chartMode, setChartMode] = useState<"cost" | "tokens">("cost");
  // Selected harness filter (undefined = all services)
  const [selectedService, setSelectedService] = useState<string | undefined>(undefined);
  // Incremented on each successful load; keys the reveal animation so data
  // changes are visible without page-load theater.
  const [dataKey, setDataKey] = useState(0);

  const load = useCallback(
    async (targetWindow: UsageWindow) => {
      setIsLoading(true);
      setError("");
      try {
        // The daemon caches local scans (10s TTL), so per-window fetches are
        // cheap and the response's summary/services/breakdown are already
        // window-correct. Only the service filter is derived client-side.
        const result = await usageClient.getStats(targetWindow);
        setData(result);
        setDataKey((key) => key + 1);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load usage");
      }
      setIsLoading(false);
    },
    [usageClient],
  );

  // Initial + window-change loads run in an effect-local async IIFE (with
  // cancellation) so no setState happens synchronously inside the effect.
  // The loading/error flags for window switches are set by `selectWindow`.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await usageClient.getStats(window);
        if (cancelled) return;
        setData(result);
        setDataKey((key) => key + 1);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load usage");
      }
      if (!cancelled) setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [window, usageClient]);

  const selectWindow = (next: UsageWindow) => {
    setError("");
    setIsLoading(true);
    setWindow(next);
  };

  // ---- Client-side derivation: service filter only (window is server-side) ----
  const filtered = useMemo(() => {
    if (!data) return null;
    // Chart data: per-service series when a harness is selected, else the
    // aggregate series (both already window-scoped by the server).
    const chartSeries = selectedService
      ? (data.serviceDailySeries.find((series) => series.serviceId === selectedService)?.points ?? [])
      : data.dailySeries;

    // Service-filtered summary: derive from the services list when a harness
    // is selected; otherwise use the server's window-correct summary.
    const services =
      selectedService === undefined ? data.services : data.services.filter((service) => service.id === selectedService);
    const totalCost = services.reduce((sum, service) => sum + (service.costUsd ?? 0), 0);
    const totalTokens = services.reduce((sum, service) => sum + service.totalTokens, 0);
    const messageCount = services.reduce((sum, service) => sum + service.messageCount, 0);
    const serviceDaily = services.map((service) => {
      const series = data.serviceDailySeries.find((item) => item.serviceId === service.id);
      return series?.points ?? [];
    });
    const inputTokens = serviceDaily.reduce((sum, points) => sum + points.reduce((s, p) => s + p.inputTokens, 0), 0);
    const outputTokens = serviceDaily.reduce((sum, points) => sum + points.reduce((s, p) => s + p.outputTokens, 0), 0);
    const cachedInputTokens = serviceDaily.reduce(
      (sum, points) => sum + points.reduce((s, p) => s + p.cachedInputTokens, 0),
      0,
    );

    const summary =
      selectedService === undefined
        ? data.summary
        : ({
            rawTokenCostUsd: totalCost > 0 ? totalCost : null,
            processedTokens: totalTokens,
            cachedInputTokens,
            uncachedInputTokens: Math.max(inputTokens - cachedInputTokens, 0),
            outputTokens,
            reasoningTokens: 0,
            cacheSavingsUsd: null,
            activeDays: new Set(
              serviceDaily
                .flat()
                .filter((p) => p.totalTokens > 0)
                .map((p) => p.date),
            ).size,
            messageCount,
            // Session count is not derivable client-side per service; use the
            // service count as a lower bound and let the full summary show the
            // real value when no filter is active.
            sessionCount: services.length,
            costSource: data.summary.costSource,
            // Shares are only computed server-side over the full dataset; the
            // filtered view keeps the badge but not the share breakdown.
            costQuality: {
              reportedShare: null,
              estimatedShare: null,
              unpricedTurns: 0,
            },
          } satisfies UsageStatsOutput["summary"]);

    return {
      chartSeries,
      summary,
      services: services.map((service) => ({
        ...service,
        costShare: totalCost > 0 ? (service.costUsd ?? 0) / totalCost : 0,
      })),
      modelBreakdown: data.modelBreakdown
        .filter((item) => item.providerId === selectedService || selectedService === undefined)
        .sort((a, b) => (b.costUsd ?? 0) - (a.costUsd ?? 0)),
    };
  }, [data, selectedService]);

  const hasData = (filtered?.services.length ?? 0) > 0;
  const hasChartActivity = (filtered?.chartSeries ?? []).some(
    (point) => point.totalTokens > 0 || (point.costUsd ?? 0) > 0,
  );
  const summary = filtered?.summary;
  const services = filtered?.services ?? [];
  const chartSeries = filtered?.chartSeries ?? [];
  const modelBreakdown = filtered?.modelBreakdown ?? [];

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 p-6 lg:p-8">
        {/* Header: title + window control inline */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Usage</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Token consumption and raw API-equivalent cost across your agents.
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
            {WINDOWS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={window === item.id}
                onClick={() => selectWindow(item.id)}
                className={`usage-press rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  window === item.id ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </header>

        {error && (
          <section className="rounded-xl border border-destructive/30 bg-destructive/10 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-destructive">Could not load usage</p>
                <p className="mt-1 text-sm text-muted-foreground">{error}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => void load(window)} disabled={isLoading}>
                <RefreshIcon className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                Try again
              </Button>
            </div>
          </section>
        )}

        {isLoading && !data && (
          <div className="space-y-6" aria-label="Loading usage data">
            <div className="h-32 animate-pulse rounded-xl border border-border bg-muted/40" />
            <div className="h-72 animate-pulse rounded-xl border border-border bg-muted/40" />
          </div>
        )}

        {data && !hasData && !isLoading && (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No usage data yet</EmptyTitle>
              <EmptyDescription>
                Run a conversation with an agent to start tracking token usage and cost. Usage appears here once
                sessions finish.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {data && hasData && summary && (
          <>
            {/* Cost + service share band */}
            <section className="usage-reveal grid gap-4 lg:grid-cols-[1.2fr_1fr]" key={`band-${dataKey}`}>
              <Card className="border-0 bg-transparent shadow-none ring-0">
                <CardContent className="flex flex-col justify-between gap-6 p-6 lg:flex-row lg:items-end">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Raw token cost
                      </p>
                    </div>
                    <div
                      key={`value-${dataKey}`}
                      className="usage-reveal-value mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1"
                    >
                      <span className="text-5xl font-bold tabular-nums tracking-tight">
                        {summary.rawTokenCostUsd !== null ? currency.format(summary.rawTokenCostUsd) : "—"}
                      </span>
                      <span className="text-xs font-medium text-muted-foreground">if billed at full API rate</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <CostSourceBadge source={summary.costSource} />
                    {summary.costQuality.estimatedShare !== null && summary.costQuality.estimatedShare > 0 && (
                      <span className="text-xs text-muted-foreground" data-testid="usage-cost-quality">
                        {Math.round((summary.costQuality.reportedShare ?? 0) * 100)}% reported ·{" "}
                        {Math.round(summary.costQuality.estimatedShare * 100)}% estimated
                      </span>
                    )}
                    <Button variant="outline" size="sm" onClick={() => void load(window)} disabled={isLoading}>
                      <RefreshIcon className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                      Refresh
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <div className="flex flex-col gap-3">
                {/* All-services chip + per-service rows (click to filter) */}
                <button
                  type="button"
                  onClick={() => setSelectedService(undefined)}
                  className={`usage-press flex items-center justify-between gap-4 rounded-lg border px-4 py-3 transition-colors ${
                    selectedService === undefined
                      ? "border-accent bg-accent/10"
                      : "border-dashed border-border bg-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="text-sm font-medium">All services</span>
                  <span className="text-xs tabular-nums text-muted-foreground">{services.length} harnesses</span>
                </button>
                {services.map((service) => (
                  <button
                    key={service.id}
                    type="button"
                    onClick={() => setSelectedService(service.id)}
                    aria-pressed={selectedService === service.id}
                    className={`usage-press flex items-center justify-between gap-4 rounded-lg border px-4 py-3 text-left transition-colors ${
                      selectedService === service.id
                        ? "border-accent bg-accent/10"
                        : "border-border bg-card hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <ModelIcon modelId={service.id} customClass="h-4 w-4 shrink-0" isDark={themeStore.state.isDark} />
                      <span className="truncate text-sm font-medium">{service.label}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-4">
                      <span className="text-sm font-semibold tabular-nums">
                        {service.costUsd !== null && service.costUsd > 0 ? currency.format(service.costUsd) : "$0.00"}
                      </span>
                      <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                        {(service.costShare * 100).toFixed(1)}%
                      </span>
                    </div>
                  </button>
                ))}
                {services.length === 0 && (
                  <div className="flex items-center justify-center rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                    No service activity in this window.
                  </div>
                )}
              </div>
            </section>

            {/* Chart as the main stage */}
            <Card className="usage-reveal" key={`chart-${dataKey}`}>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>Daily {chartMode === "cost" ? "cost" : "tokens"}</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {chartMode === "cost" ? "Raw API-equivalent cost per day" : "Total tokens processed per day"}
                  </p>
                </div>
                <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
                  {(["cost", "tokens"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setChartMode(mode)}
                      className={`usage-press rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                        chartMode === mode ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {mode === "cost" ? "Cost" : "Tokens"}
                    </button>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                {hasChartActivity ? (
                  <DailyUsageChart points={chartSeries} mode={chartMode} />
                ) : (
                  <div className="flex h-72 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-center">
                    <p className="text-sm font-medium">No activity in this window</p>
                    <p className="text-xs text-muted-foreground">Try a wider time range to see daily usage here.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Metric strip */}
            <section
              className="usage-reveal grid grid-cols-2 md:gap-x-5 md:gap-y-5 gap-x-6 gap-y-6 md:grid-cols-5"
              key={`metrics-${dataKey}`}
            >
              <Metric
                icon={<LayersIcon className="h-3.5 w-3.5" />}
                label="Processed tokens"
                value={formatTokens(summary.processedTokens)}
                hint={`${summary.activeDays} active day${summary.activeDays === 1 ? "" : "s"}`}
              />
              <Metric
                icon={<CachedIcon className="h-3.5 w-3.5" />}
                label="Cached input"
                value={formatTokens(summary.cachedInputTokens)}
                hint={
                  summary.processedTokens > 0
                    ? `${((summary.cachedInputTokens / summary.processedTokens) * 100).toFixed(1)}% of processed`
                    : undefined
                }
              />
              <Metric
                icon={<CoinsIcon className="h-3.5 w-3.5" />}
                label="Uncached input"
                value={formatTokens(summary.uncachedInputTokens)}
              />
              <Metric
                icon={<OutputIcon className="h-3.5 w-3.5" />}
                label="Output"
                value={formatTokens(summary.outputTokens)}
                hint={
                  summary.reasoningTokens > 0
                    ? `includes ${formatTokens(summary.reasoningTokens)} reasoning`
                    : undefined
                }
              />
              <Metric
                icon={<WalletIcon className="h-3.5 w-3.5" />}
                label="Cache savings"
                value={summary.cacheSavingsUsd !== null ? currency.format(summary.cacheSavingsUsd) : "—"}
              />
            </section>

            {/* Breakdown as a flat section, not a card */}
            <section className="usage-reveal" key={`breakdown-${dataKey}`}>
              <div className="flex items-baseline justify-between border-b border-border pb-3">
                <h2 className="text-sm font-semibold">Breakdown</h2>
                <span className="text-xs text-muted-foreground">By model in this window</span>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Model</TableHead>
                      <TableHead>Harness</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="text-right">Share</TableHead>
                      <TableHead className="text-right">Tokens</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {modelBreakdown.map((item) => (
                      <TableRow key={`${item.id}:${item.label}`}>
                        <TableCell>
                          <div className="flex min-w-0 items-center gap-2.5">
                            <ModelIcon
                              modelId={item.id}
                              customClass="h-4 w-4 shrink-0"
                              isDark={themeStore.state.isDark}
                            />
                            <span className="truncate font-mono text-xs">{item.label}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex min-w-0 items-center gap-2">
                            <ModelIcon
                              modelId={item.providerId}
                              customClass="h-3.5 w-3.5 shrink-0"
                              isDark={themeStore.state.isDark}
                            />
                            <span className="truncate text-xs text-muted-foreground">
                              {harnessLabel(item.providerId)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {item.costUsd !== null && item.costUsd > 0 ? currency.format(item.costUsd) : "$0.00"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{(item.costShare * 100).toFixed(1)}%</TableCell>
                        <TableCell className="text-right tabular-nums">{formatTokens(item.totalTokens)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
