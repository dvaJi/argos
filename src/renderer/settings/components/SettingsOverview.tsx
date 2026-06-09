import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Icon } from '@iconify/react'
import { Button } from '@shadcn/components/ui/button'
import { Badge } from '@shadcn/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@shadcn/components/ui/table'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@shadcn/components/ui/empty'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@shadcn/components/ui/input-group'
import { createSettingsClient } from '@api/SettingsClient'
import type { SettingsActivityRecord } from '@shared/contracts/routes'
import {
  getSettingsNavigationItems,
  resolveSettingsNavigationPath
} from '@shared/settingsNavigation'
import type { SettingsNavigationItem } from '@shared/settingsNavigation'
import { useProviderStore } from '@/stores/providerStore'
import { useModelStore } from '@/stores/modelStore'
import { useMcpStore } from '@/stores/mcp'
import { useSyncStore } from '@/stores/sync'
import { useAgentStore } from '@/stores/ui/agent'
import { useRouter } from '@tanstack/react-router'
import SettingsPageShell from './control-center/SettingsPageShell'
import SettingsSectionCard from './control-center/SettingsSectionCard'
import StatusMetricCard from './control-center/StatusMetricCard'
import DashboardSettings from './DashboardSettings'

type SettingsRouteName = SettingsNavigationItem['routeName']
const settingsItems = getSettingsNavigationItems(window.electron?.process?.platform)

const categoryLabels: Record<string, string> = {
  provider: 'Providers',
  model: 'Models',
  mcp: 'MCP',
  privacy: 'Privacy Mode',
  appearance: 'Display',
  agent: 'Models',
  knowledge: 'Knowledge',
  prompt: 'Prompt',
  shortcut: 'Shortcuts',
  data: 'Data & Privacy',
  system: 'System'
}

export default function SettingsOverview() {
  const router = useRouter()
  const settingsClient = createSettingsClient()
  const providerStore = useProviderStore()
  const modelStore = useModelStore()
  const mcpStore = useMcpStore()
  const syncStore = useSyncStore()
  const agentStore = useAgentStore()

  const [activities, setActivities] = useState<SettingsActivityRecord[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const usageDashboardRef = useRef<HTMLDivElement>(null)

  const enabledProvidersCount = useMemo(
    () => providerStore.providers.filter((p) => p.id !== 'acp' && p.enable).length,
    [providerStore.providers]
  )
  const enabledModelsCount = useMemo(
    () => modelStore.enabledModels.reduce((count, group) => count + group.models.length, 0),
    [modelStore.enabledModels]
  )
  const mcpEnabled = mcpStore.mcpEnabled
  const runningMcpCount = useMemo(
    () => mcpStore.serverList.filter((s) => s.isRunning).length,
    [mcpStore.serverList]
  )
  const enabledDeepChatAgentsCount = useMemo(
    () => agentStore.enabledAgents.filter((a) => (a.agentType ?? a.type) === 'deepchat').length,
    [agentStore.enabledAgents]
  )

  const quickTasks = useMemo(
    () => [
      {
        key: 'api-key',
        label: 'Add API Key',
        routeName: 'settings-provider' as SettingsRouteName,
        icon: 'lucide:key-round',
        done: providerStore.providers.some((p) => p.id !== 'acp' && p.apiKey)
      },
      {
        key: 'enable-model',
        label: 'Enable Model',
        routeName: 'settings-provider' as SettingsRouteName,
        icon: 'lucide:box',
        done: enabledModelsCount > 0
      },
      {
        key: 'start-mcp',
        label: 'Start MCP Server',
        routeName: 'settings-mcp' as SettingsRouteName,
        icon: 'lucide:server',
        done: runningMcpCount > 0
      },
      {
        key: 'backup',
        label: 'Backup Now',
        routeName: 'settings-database' as SettingsRouteName,
        icon: 'lucide:database-backup',
        done: Boolean(syncStore.lastSyncTime)
      }
    ],
    [providerStore.providers, enabledModelsCount, runningMcpCount, syncStore.lastSyncTime]
  )

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return []
    return settingsItems
      .filter((item) => {
        const title = (item.titleKey ?? '').toLowerCase()
        return (
          title.includes(query) ||
          item.keywords.some((keyword) => keyword.toLowerCase().includes(query))
        )
      })
      .slice(0, 8)
  }, [searchQuery])

  const openRoute = useCallback(
    (routeName: SettingsRouteName) => {
      void router.navigate({ to: resolveSettingsNavigationPath(routeName) })
    },
    [router]
  )

  const openActivity = useCallback(
    (activity: SettingsActivityRecord) => {
      if (!activity.routeName) return
      void router.navigate({
        to: activity.routeName,
        params: activity.routeParams as Record<string, string>
      })
    },
    [router]
  )

  const openFirstSearchResult = () => {
    const first = searchResults[0]
    if (first) openRoute(first.routeName)
  }

  const getActivityCategoryLabel = (category: SettingsActivityRecord['category']) =>
    categoryLabels[category] ?? category

  const formatDate = (timestamp: number) =>
    new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(timestamp)
    )

  useEffect(() => {
    void (async () => {
      await Promise.allSettled([
        providerStore.ensureInitialized?.(),
        modelStore.initialize?.(),
        mcpStore.loadConfig?.(),
        syncStore.initialize?.(),
        agentStore.fetchAgents()
      ])
      try {
        setActivities(await settingsClient.listRecentActivity(200))
      } catch (error) {
        console.warn('[SettingsOverview] Failed to load activity:', error)
        setActivities([])
      }
    })()
  }, [providerStore, modelStore, mcpStore, syncStore, agentStore, settingsClient])

  return (
    <SettingsPageShell
      data-testid="settings-overview-page"
      title="Overview"
      description="Your settings at a glance"
    >
      <InputGroup>
        <InputGroupAddon>
          <Icon icon="lucide:search" className="size-4" />
        </InputGroupAddon>
        <InputGroupInput
          value={searchQuery}
          placeholder="Search settings..."
          onKeyDown={(e) => {
            if (e.key === 'Enter') openFirstSearchResult()
          }}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </InputGroup>

      {searchResults.length > 0 && (
        <div
          className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
          data-testid="settings-overview-search-results"
        >
          {searchResults.map((item) => (
            <Button
              key={item.routeName}
              variant="outline"
              className="justify-start"
              onClick={() => openRoute(item.routeName)}
            >
              <Icon icon={item.icon} className="size-4" />
              <span className="truncate">{item.titleKey}</span>
            </Button>
          ))}
        </div>
      )}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatusMetricCard
          label="Providers"
          value={`${enabledProvidersCount} enabled`}
          icon="lucide:cloud-cog"
          description="AI model providers"
          interactive
          onSelect={() => openRoute('settings-provider')}
        />
        <StatusMetricCard
          label="MCP"
          value={`${runningMcpCount} running`}
          icon="lucide:server"
          description={mcpEnabled ? 'MCP is enabled' : 'MCP is disabled'}
          interactive
          onSelect={() => openRoute('settings-mcp')}
        />
        <StatusMetricCard
          label="DeepChat Agents"
          value={`${enabledDeepChatAgentsCount} enabled`}
          icon="lucide:bot"
          description="Built-in agents"
          interactive
          onSelect={() => openRoute('settings-deepchat-agents')}
        />
        <div className="min-w-0 rounded-lg border bg-card shadow-sm">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="truncate text-sm text-muted-foreground">Quick Start</span>
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
                  icon={task.done ? 'lucide:check-circle-2' : task.icon}
                  className={`size-4 shrink-0 ${task.done ? 'text-emerald-500' : 'text-muted-foreground'}`}
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

      <SettingsSectionCard title="Recent Activity" description="Recent changes to your settings">
        {activities.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activities.map((activity) => (
                <TableRow
                  key={activity.id}
                  className="cursor-pointer"
                  onClick={() => openActivity(activity)}
                >
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
              <EmptyTitle>No recent activity</EmptyTitle>
              <EmptyDescription>Changes you make to settings will appear here.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </SettingsSectionCard>
    </SettingsPageShell>
  )
}
