import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Badge } from "#shadcn/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#shadcn/components/ui/table";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "#shadcn/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "#shadcn/components/ui/input-group";
import { createSettingsClient } from "#api/SettingsClient";
import { getRuntimePlatform } from "#api/runtime";
import type { SettingsActivityRecord } from "@argos/shared-contracts/routes";
import {
  getSettingsNavigationItems,
  resolveTitle,
  resolveSettingsNavigationPath,
} from "@argos/shared/settingsNavigation";
import type { SettingsNavigationItem } from "@argos/shared/settingsNavigation";
import { ensureInitialized, useProviderStore } from "#/stores/providerStore";
import { initialize as initializeModels, useModelStore } from "#/stores/modelStore";
import { loadConfig, useMcpStore } from "#/stores/mcp";
import { initializeSync, useSyncStore } from "#/stores/sync";
import { fetchAgents, useAgentStore } from "#/stores/ui/agent";
import { useRouter } from "@tanstack/react-router";
import SettingsPageShell from "./control-center/SettingsPageShell";
import SettingsSectionCard from "./control-center/SettingsSectionCard";
import StatusMetricCard from "./control-center/StatusMetricCard";
import DashboardSettings from "./DashboardSettings";

type SettingsRouteName = SettingsNavigationItem["routeName"];
const settingsItems = getSettingsNavigationItems(getRuntimePlatform());

const categoryLabels: Record<string, string> = {
  provider: resolveTitle("settings.overview.categories.provider"),
  model: resolveTitle("settings.overview.categories.model"),
  mcp: resolveTitle("settings.overview.categories.mcp"),
  privacy: resolveTitle("settings.overview.categories.privacy"),
  appearance: resolveTitle("settings.overview.categories.appearance"),
  agent: resolveTitle("settings.overview.categories.agent"),
  knowledge: resolveTitle("settings.overview.categories.knowledge"),
  prompt: resolveTitle("settings.overview.categories.prompt"),
  shortcut: resolveTitle("settings.overview.categories.shortcut"),
  data: resolveTitle("settings.overview.categories.data"),
  system: resolveTitle("settings.overview.categories.system"),
};

const ACTIVITY_TIMESTAMP_FORMAT = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export default function SettingsOverview() {
  const router = useRouter();
  const settingsClient = useMemo(() => createSettingsClient(), []);
  const providerStore = useProviderStore();
  const modelStore = useModelStore();
  const mcpStore = useMcpStore();
  const syncStore = useSyncStore();
  const agentStore = useAgentStore();

  const [activities, setActivities] = useState<SettingsActivityRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const usageDashboardRef = useRef<HTMLDivElement>(null);

  const settingsItemLabels = useMemo(
    () =>
      settingsItems.map((item) => ({
        ...item,
        title: resolveTitle(item.titleKey),
      })),
    [],
  );

  const enabledProvidersCount = useMemo(
    () => providerStore.providers.filter((p) => p.id !== "acp" && p.enable).length,
    [providerStore.providers],
  );
  const enabledModelsCount = useMemo(
    () => modelStore.enabledModels.reduce((count, group) => count + group.models.length, 0),
    [modelStore.enabledModels],
  );
  const mcpEnabled = mcpStore.mcpEnabled;
  const runningMcpCount = useMemo(() => mcpStore.serverList.filter((s) => s.isRunning).length, [mcpStore.serverList]);
  const enabledArgosAgentsCount = useMemo(
    () => agentStore.enabledAgents.filter((a) => (a.agentType ?? a.type) === "argos").length,
    [agentStore.enabledAgents],
  );

  const quickTasks = useMemo(
    () => [
      {
        key: "api-key",
        label: resolveTitle("settings.overview.quickTasks.addApiKey"),
        routeName: "settings-provider" as SettingsRouteName,
        icon: "lucide:key-round",
        done: providerStore.providers.some((p) => p.id !== "acp" && p.apiKey),
      },
      {
        key: "enable-model",
        label: resolveTitle("settings.overview.quickTasks.enableModel"),
        routeName: "settings-provider" as SettingsRouteName,
        icon: "lucide:box",
        done: enabledModelsCount > 0,
      },
      {
        key: "start-mcp",
        label: resolveTitle("settings.overview.quickTasks.startMcpServer"),
        routeName: "settings-mcp" as SettingsRouteName,
        icon: "lucide:server",
        done: runningMcpCount > 0,
      },
      {
        key: "backup",
        label: resolveTitle("settings.overview.quickTasks.backupNow"),
        routeName: "settings-database" as SettingsRouteName,
        icon: "lucide:database-backup",
        done: Boolean(syncStore.lastSyncTime),
      },
    ],
    [providerStore.providers, enabledModelsCount, runningMcpCount, syncStore.lastSyncTime],
  );

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    return settingsItemLabels
      .filter((item) => {
        const title = item.title.toLowerCase();
        return title.includes(query) || item.keywords.some((keyword) => keyword.toLowerCase().includes(query));
      })
      .slice(0, 8);
  }, [searchQuery, settingsItemLabels]);

  const openRoute = useCallback(
    (routeName: SettingsRouteName) => {
      console.log("Navigating to route:", routeName);
      void router.navigate({ to: `/settings${resolveSettingsNavigationPath(routeName)}` });
    },
    [router],
  );

  const openActivity = useCallback(
    (activity: SettingsActivityRecord) => {
      if (!activity.routeName) return;
      void router.navigate({
        to: `/settings${resolveSettingsNavigationPath(
          activity.routeName as any,
          activity.routeParams as Record<string, string> | undefined,
        )}`,
      });
    },
    [router],
  );

  const openFirstSearchResult = () => {
    const first = searchResults[0];
    if (first) openRoute(first.routeName);
  };

  const getActivityCategoryLabel = (category: SettingsActivityRecord["category"]) =>
    categoryLabels[category] ?? category;

  const formatDate = (timestamp: number) => ACTIVITY_TIMESTAMP_FORMAT.format(new Date(timestamp));

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.allSettled([
        ensureInitialized(),
        initializeModels(),
        loadConfig(),
        initializeSync(),
        fetchAgents(),
      ]);
      if (cancelled) return;
      try {
        const activities = await settingsClient.listRecentActivity(200);
        if (!cancelled) setActivities(activities);
      } catch (error) {
        console.warn("[SettingsOverview] Failed to load activity:", error);
        if (!cancelled) setActivities([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [settingsClient]);

  return (
    <SettingsPageShell
      data-testid="settings-overview-page"
      title={resolveTitle("settings.overview.title")}
      description={resolveTitle("settings.overview.description")}
    >
      <InputGroup>
        <InputGroupAddon>
          <Icon icon="lucide:search" className="size-4" />
        </InputGroupAddon>
        <InputGroupInput
          value={searchQuery}
          placeholder={resolveTitle("settings.overview.searchPlaceholder")}
          onKeyDown={(e) => {
            if (e.key === "Enter") openFirstSearchResult();
          }}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </InputGroup>

      {searchResults.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" data-testid="settings-overview-search-results">
          {searchResults.map((item) => (
            <Button
              key={item.routeName}
              variant="outline"
              className="justify-start"
              onClick={() => openRoute(item.routeName)}
            >
              <Icon icon={item.icon} className="size-4" />
              <span className="truncate">{item.title}</span>
            </Button>
          ))}
        </div>
      )}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatusMetricCard
          label={resolveTitle("settings.overview.metrics.providers")}
          value={`${enabledProvidersCount} ${resolveTitle("settings.overview.metrics.enabled")}`}
          icon="lucide:cloud-cog"
          description={resolveTitle("settings.overview.metrics.providersDescription")}
          interactive
          onSelect={() => openRoute("settings-provider")}
        />
        <StatusMetricCard
          label={resolveTitle("settings.overview.metrics.mcp")}
          value={`${runningMcpCount} ${resolveTitle("settings.overview.metrics.running")}`}
          icon="lucide:server"
          description={
            mcpEnabled
              ? resolveTitle("settings.overview.metrics.mcpEnabled")
              : resolveTitle("settings.overview.metrics.mcpDisabled")
          }
          interactive
          onSelect={() => openRoute("settings-mcp")}
        />
        <StatusMetricCard
          label={resolveTitle("settings.overview.metrics.argosAgents")}
          value={`${enabledArgosAgentsCount} ${resolveTitle("settings.overview.metrics.enabled")}`}
          icon="lucide:bot"
          description={resolveTitle("settings.overview.metrics.argosAgentsDescription")}
          interactive
          onSelect={() => openRoute("settings-argos-agents")}
        />
        <div className="min-w-0 rounded-lg border bg-card shadow-sm">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="truncate text-sm text-muted-foreground">
              {resolveTitle("settings.overview.quickStart")}
            </span>
            <Icon icon="lucide:list-checks" className="size-4 shrink-0 text-muted-foreground" />
          </div>
          <div className="grid gap-1.5 px-4 pb-4">
            {quickTasks.map((task) => (
              <button
                key={task.key}
                type="button"
                className="flex h-8 min-w-0 items-center gap-2 rounded-md border border-border/70 bg-background/70 px-2 text-start text-xs transition-colors hover:bg-accent"
                title={task.label}
                onClick={() => openRoute(task.routeName)}
              >
                <Icon
                  icon={task.done ? "lucide:check-circle-2" : task.icon}
                  className={`size-4 shrink-0 ${task.done ? "text-emerald-500" : "text-muted-foreground"}`}
                />
                <span className="min-w-0 truncate font-medium">{task.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section
        ref={usageDashboardRef}
        data-testid="settings-overview-usage-dashboard"
        className="min-h-[640px] overflow-hidden rounded-lg border border-border"
      >
        <DashboardSettings />
      </section>

      <SettingsSectionCard
        title={resolveTitle("settings.overview.activity.title")}
        description={resolveTitle("settings.overview.activity.description")}
      >
        {activities.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{resolveTitle("settings.overview.activity.when")}</TableHead>
                <TableHead>{resolveTitle("settings.overview.activity.category")}</TableHead>
                <TableHead>{resolveTitle("settings.overview.activity.change")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activities.map((activity) => (
                <TableRow key={activity.id} className="cursor-pointer" onClick={() => openActivity(activity)}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDate(activity.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{getActivityCategoryLabel(activity.category)}</Badge>
                  </TableCell>
                  <TableCell className="min-w-0">
                    <span className="line-clamp-2 text-sm">{activity.summaryKey}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{resolveTitle("settings.overview.activity.emptyTitle")}</EmptyTitle>
              <EmptyDescription>{resolveTitle("settings.overview.activity.emptyDescription")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </SettingsSectionCard>
    </SettingsPageShell>
  );
}
