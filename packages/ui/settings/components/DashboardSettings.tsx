import { useState, useEffect, useRef } from "react";
import { Icon } from "@iconify/react";
import { ScrollArea } from "#shadcn/components/ui/scroll-area";
import { Button } from "#shadcn/components/ui/button";
import { createUsageClient } from "#api/UsageClient";
import type { UsageStatsOutput } from "@argos/shared-contracts/routes";
import UsageNostalgiaCard from "./control-center/UsageNostalgiaCard";

// Process-wide singleton; module scope keeps hook/effect dependencies stable.
const usageClient = createUsageClient();

export interface DashboardSettingsProps {
  hideNostalgia?: boolean;
  onDashboardLoaded?: (dashboard: UsageStatsOutput) => void;
}

interface DashboardDeps {
  onDashboardLoaded?: (dashboard: UsageStatsOutput) => void;
  isDashboardMountedRef: { current: boolean };
  emptyRetryCountRef: { current: number };
  refreshTimerRef: { current: number | null };
  setDashboard: (dashboard: UsageStatsOutput | null) => void;
  setErrorMessage: (message: string) => void;
  setIsLoading: (loading: boolean) => void;
}

function clearRefreshTimer(deps: DashboardDeps): void {
  if (deps.refreshTimerRef.current !== null) {
    window.clearTimeout(deps.refreshTimerRef.current);
    deps.refreshTimerRef.current = null;
  }
}

function scheduleDashboardRefresh(deps: DashboardDeps, delayMs = 1500): void {
  clearRefreshTimer(deps);
  deps.refreshTimerRef.current = window.setTimeout(() => {
    deps.refreshTimerRef.current = null;
    if (!deps.isDashboardMountedRef.current) return;
    void loadDashboard(deps);
  }, delayMs);
}

async function loadDashboard(deps: DashboardDeps): Promise<void> {
  if (!deps.isDashboardMountedRef.current) return;
  let shouldFinalize = false;
  try {
    clearRefreshTimer(deps);
    deps.setIsLoading(true);
    deps.setErrorMessage("");
    const nextDashboard = await usageClient.getStats("30d");
    if (!deps.isDashboardMountedRef.current) return;
    deps.setDashboard(nextDashboard);
    deps.onDashboardLoaded?.(nextDashboard);

    // A zero messageCount is a valid result for users with no usage data.
    // Retry a bounded number of times (covers a just-started session), then
    // stop — never poll forever while the settings view stays open.
    const shouldRetryEmptyDashboard = nextDashboard.summary.messageCount === 0 && deps.emptyRetryCountRef.current < 5;
    if (shouldRetryEmptyDashboard) {
      deps.emptyRetryCountRef.current += 1;
      scheduleDashboardRefresh(deps);
    } else {
      deps.emptyRetryCountRef.current = 0;
    }
    shouldFinalize = true;
  } catch (error) {
    if (!deps.isDashboardMountedRef.current) return;
    deps.setErrorMessage(error instanceof Error ? error.message : "Failed to load dashboard");
    scheduleDashboardRefresh(deps, 3000);
    shouldFinalize = true;
  }
  if (shouldFinalize && deps.isDashboardMountedRef.current) {
    deps.setIsLoading(false);
  }
}

export default function DashboardSettings({ hideNostalgia = false, onDashboardLoaded }: DashboardSettingsProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [dashboard, setDashboard] = useState<UsageStatsOutput | null>(null);
  const isDashboardMountedRef = useRef(true);
  const refreshTimerRef = useRef<number | null>(null);
  const emptyRetryCountRef = useRef(0);
  const loadDashboardRef = useRef<() => Promise<void>>(async () => {});
  // Plain bundle passed by argument to the module-scope helpers — never a
  // dependency, so the mount effect below stays keyed on nothing and cannot
  // loop. Every field is a stable ref/setter except onDashboardLoaded, which
  // loadDashboardRef re-syncs.
  const dashboardDeps: DashboardDeps = {
    onDashboardLoaded,
    isDashboardMountedRef,
    emptyRetryCountRef,
    refreshTimerRef,
    setDashboard,
    setErrorMessage,
    setIsLoading,
  };
  const dashboardDepsRef = useRef<DashboardDeps>(dashboardDeps);
  useEffect(() => {
    dashboardDepsRef.current = dashboardDeps;
  });
  useEffect(() => {
    loadDashboardRef.current = () => loadDashboard(dashboardDepsRef.current);
  });
  useEffect(() => {
    isDashboardMountedRef.current = true;
    void loadDashboardRef.current();
    return () => {
      isDashboardMountedRef.current = false;
      clearRefreshTimer(dashboardDepsRef.current);
    };
  }, []);
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
            onClick={() => void loadDashboard(dashboardDepsRef.current)}
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
              className={`h-68 animate-pulse rounded-2xl border border-border bg-muted/40 md:col-span-2 ${hideNostalgia ? "xl:col-span-4" : "xl:col-span-3"}`}
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
