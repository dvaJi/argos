import { useState, useEffect, useMemo, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { Button } from '@shadcn/components/ui/button'
import { Separator } from '@shadcn/components/ui/separator'
import { Switch } from '@shadcn/components/ui/switch'
import { McpBuiltinMarket } from './McpBuiltinMarket'
import { useMcpStore } from '@/stores/mcp'
import { useLanguageStore } from '@/stores/language'
import { useToast } from '@/components/use-toast'

export default function McpSettings() {
  const languageStore = useLanguageStore()
  const mcpStore = useMcpStore()
  const { toast } = useToast()
  const [isMarketView, setIsMarketView] = useState(false)
  const [npmAdvancedDialogOpen, setNpmAdvancedDialogOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [customRegistryInput, setCustomRegistryInput] = useState('')
  const [npmRegistryStatus, setNpmRegistryStatus] = useState<{
    currentRegistry: string | null
    autoDetectEnabled: boolean
    customRegistry?: string
  }>({ currentRegistry: null, autoDetectEnabled: true })

  const mcpEnabled = useMemo(() => mcpStore.mcpEnabled, [mcpStore.mcpEnabled])
  const showSkeleton = useMemo(
    () => mcpStore.configLoading && !mcpStore.config.ready,
    [mcpStore.configLoading, mcpStore.config.ready]
  )
  const runningCount = useMemo(
    () => mcpStore.serverList.filter((s) => s.isRunning).length,
    [mcpStore.serverList]
  )
  const builtInCount = useMemo(
    () =>
      mcpStore.serverList.filter((s) => {
        const config = mcpStore.config.mcpServers[s.name]
        return config?.type === 'inmemory' || config?.source === 'deepchat'
      }).length,
    [mcpStore.serverList, mcpStore.config.mcpServers]
  )
  const customCount = useMemo(
    () => Math.max(mcpStore.serverList.length - builtInCount, 0),
    [mcpStore.serverList.length, builtInCount]
  )

  const loadNpmRegistryStatus = async () => {
    try {
      const status = await mcpStore.getNpmRegistryStatus()
      setNpmRegistryStatus(status)
      setCustomRegistryInput(status.customRegistry || '')
    } catch {}
  }

  useEffect(() => {
    loadNpmRegistryStatus()
  }, [])

  if (isMarketView) {
    return (
      <div data-testid="settings-mcp-page" className="w-full h-full">
        <McpBuiltinMarket embedded onBack={() => setIsMarketView(false)} />
      </div>
    )
  }

  if (showSkeleton) {
    return (
      <div
        data-testid="settings-mcp-page"
        className="w-full h-full flex flex-col p-4 gap-4 animate-pulse"
      >
        <div className="h-16 rounded-xl bg-muted/40" />
        <div className="h-24 rounded-xl bg-muted/30" />
        <div className="h-10 rounded-xl bg-muted/20" />
        <div className="flex-1 rounded-xl bg-muted/20" />
      </div>
    )
  }

  return (
    <div data-testid="settings-mcp-page" className="w-full h-full min-h-0 flex flex-col">
      <div className="shrink-0 px-4 pt-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div dir={languageStore.dir} className="min-w-0">
              <h1 className="text-lg font-semibold">MCP Center</h1>
              <p className="text-xs text-muted-foreground">Manage MCP servers and tools</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {mcpEnabled && (
                <Button size="sm" onClick={() => {}}>
                  <Icon icon="lucide:plus" className="size-4" />
                  Add
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setIsMarketView(true)}>
                <Icon icon="lucide:shopping-bag" className="size-4" />
                Market
              </Button>
              <Switch
                dir="ltr"
                checked={mcpEnabled}
                onCheckedChange={(v) => mcpStore.setMcpEnabled(v)}
              />
            </div>
          </div>
        </div>
        <Separator className="mt-3" />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {mcpEnabled ? (
          <div className="h-full min-h-0 p-4">
            <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 mb-4">
              <span className="text-xs text-muted-foreground">
                Total:{' '}
                <span className="font-medium text-foreground">{mcpStore.serverList.length}</span>
              </span>
              <span className="text-xs text-muted-foreground">
                Running: <span className="font-medium text-foreground">{runningCount}</span>
              </span>
              <span className="text-xs text-muted-foreground">
                Built-in: <span className="font-medium text-foreground">{builtInCount}</span>
              </span>
              <span className="text-xs text-muted-foreground">
                Custom: <span className="font-medium text-foreground">{customCount}</span>
              </span>
            </div>
            <div className="text-sm text-muted-foreground">Server list component placeholder</div>
          </div>
        ) : (
          <div className="p-8 text-center text-muted-foreground text-sm">
            Enable MCP to access servers
          </div>
        )}
      </div>
    </div>
  )
}
