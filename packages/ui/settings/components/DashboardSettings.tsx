import { useState, useEffect, useCallback, useRef } from "react";
import { Icon } from "@iconify/react";
import { ScrollArea } from "#shadcn/components/ui/scroll-area";
import { Button } from "#shadcn/components/ui/button";
import { usePresenter } from "#api/presenterBridge";
import type { UsageDashboardData } from "@argos/shared/types/agent-interface";
import UsageNostalgiaCard from "./control-center/UsageNostalgiaCard";

export interface DashboardSettingsProps {
  hideNostalgia?: boolean;
  onDashboardLoaded?: (dashboard: UsageDashboardData) => void;
}

export default function DashboardSettings({ hideNostalgia = false, onDashboardLoaded }: DashboardSettingsProps) {
  const agentSessionPresenter = usePresenter("agentSessionPresenter");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [dashboard, setDashboard] = useState<UsageDashboardData | null>(null);
  const isDashboardMountedRef = useRef(true);
  const refreshTimerRef = useRef<number | null>(null);
  const loadDashboardRef = useRef<() => Promise<void>>(async () => {});

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const scheduleDashboardRefresh = useCallback(
    (delayMs = 1500) => {
      clearRefreshTimer();
      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null;
        if (!isDashboardMountedRef.current) return;
        void loadDashboardRef.current();
      }, delayMs);
    },
    [clearRefreshTimer],
  );

  const loadDashboard = useCallback(async () => {
    if (!isDashboardMountedRef.current) return;
    let shouldFinalize = false;
    try {
      clearRefreshTimer();
      setIsLoading(true);
      setErrorMessage("");

      await (agentSessionPresenter as { startUsageStatsBackfill?: () => Promise<void> }).startUsageStatsBackfill?.();

      const nextDashboard = await agentSessionPresenter.getUsageDashboard();
      if (!isDashboardMountedRef.current) return;
      setDashboard(nextDashboard);
      onDashboardLoaded?.(nextDashboard);

      const shouldRetryEmptyDashboard =
        nextDashboard.summary.messageCount === 0 &&
        (nextDashboard.backfillStatus.status === "idle" || nextDashboard.backfillStatus.status === "running");
      if (shouldRetryEmptyDashboard) {
        scheduleDashboardRefresh();
      }

      shouldFinalize = true;
    } catch (error) {
      if (!isDashboardMountedRef.current) return;
      setErrorMessage(error instanceof Error ? error.message : "Failed to load dashboard");
      scheduleDashboardRefresh(3000);
      shouldFinalize = true;
    } finally {
      if (shouldFinalize && isDashboardMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [agentSessionPresenter, clearRefreshTimer, onDashboardLoaded, scheduleDashboardRefresh]);

  loadDashboardRef.current = loadDashboard;

  useEffect(() => {
    isDashboardMountedRef.current = true;
    void loadDashboard();
    return () => {
      isDashboardMountedRef.current = false;
      clearRefreshTimer();
    };
  }, [clearRefreshTimer, loadDashboard]);

  const hasData = (dashboard?.summary.messageCount ?? 0) > 0;

  return (
    <ScrollArea className="h-full w-full">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4">
        <div
          data-testid="dashboard-header"
          className="flex flex-col gap-3 px-2 py-2 sm:flex-row sm:items-start sm:justify-between"
        >
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-medium text-foreground">Usage Dashboard</h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
              Track token usage, costs, and activity over time.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full shrink-0 sm:w-auto"
            disabled={isLoading}
            onClick={() => void loadDashboard()}
          >
            <Icon icon="lucide:refresh-cw" className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {errorMessage && (
          <section className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4">
            <p className="font-medium text-destructive">Error</p>
            <p className="mt-1 text-sm text-muted-foreground">{errorMessage}</p>
          </section>
        )}

        {isLoading && !dashboard && (
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div
              className={`h-68 animate-pulse rounded-2xl border border-border bg-muted/40 md:col-span-2 ${
                hideNostalgia ? "xl:col-span-4" : "xl:col-span-3"
              }`}
            />
            {!hideNostalgia && (
              <div className="h-68 animate-pulse rounded-2xl border border-border bg-muted/40 md:col-span-2 xl:col-span-1" />
            )}
          </section>
        )}

        {dashboard && !isLoading && (
          <>
            {hasData ? (
              <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {!hideNostalgia && (
                  <div className="md:col-span-2 xl:col-span-1">
                    <UsageNostalgiaCard dashboard={dashboard} />
                  </div>
                )}
              </section>
            ) : (
              <section
                data-testid="dashboard-empty"
                className="rounded-3xl border border-dashed border-border/80 bg-card/80 p-8 text-center"
              >
                <div className="mx-auto max-w-xl space-y-3">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                    <Icon icon="lucide:layout-dashboard" className="h-7 w-7 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold">No usage data yet</h3>
                  <p className="text-sm text-muted-foreground">Start a conversation to see usage statistics here.</p>
                  <p className="text-xs text-muted-foreground">Data is collected from your conversation history.</p>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </ScrollArea>
  );
}
