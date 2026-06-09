import { useState, useEffect, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { Button } from '@shadcn/components/ui/button'
import { createPluginClient } from '@api/PluginClient'
import type { PluginActionResult, PluginListItem, PluginRuntimeState } from '@shared/types/plugin'
import SettingsPageShell from './control-center/SettingsPageShell'

const pluginClient = createPluginClient()

function formatRuntimeState(state?: PluginRuntimeState): string {
  if (!state) return '-'
  const labels: Record<PluginRuntimeState, string> = {
    running: 'Running',
    stopped: 'Stopped',
    error: 'Error'
  }
  return labels[state] ?? state
}

function getPluginMcpErrors(plugin: PluginListItem): string[] {
  return (plugin.mcpServers ?? [])
    .filter((server) => Boolean(server.lastError))
    .map((server) => `${server.serverId}: ${server.lastError}`)
}

export default function PluginsSettings() {
  const [plugins, setPlugins] = useState<PluginListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [pendingPluginId, setPendingPluginId] = useState<string | null>(null)

  const loadPlugins = useCallback(async () => {
    setLoading(true)
    setErrorMessage('')
    try {
      const result = await pluginClient.listPlugins()
      setPlugins(result)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load plugins')
    } finally {
      setLoading(false)
    }
  }, [])

  const runPluginAction = useCallback(
    async (pluginId: string, action: () => Promise<PluginActionResult>) => {
      setPendingPluginId(pluginId)
      setErrorMessage('')
      try {
        const result = await action()
        if (!result.ok) {
          throw new Error(result.error || 'Action failed')
        }
        await loadPlugins()
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Action failed')
      } finally {
        setPendingPluginId(null)
      }
    },
    [loadPlugins]
  )

  const enablePlugin = useCallback(
    (pluginId: string) => runPluginAction(pluginId, () => pluginClient.enablePlugin(pluginId)),
    [runPluginAction]
  )

  const disablePlugin = useCallback(
    (pluginId: string) => runPluginAction(pluginId, () => pluginClient.disablePlugin(pluginId)),
    [runPluginAction]
  )

  const openSettings = useCallback(
    (pluginId: string) =>
      runPluginAction(pluginId, () =>
        pluginClient.invokeAction({ pluginId, actionId: 'settings.open' })
      ),
    [runPluginAction]
  )

  useEffect(() => {
    void loadPlugins()
  }, [loadPlugins])

  return (
    <SettingsPageShell
      title="Plugins"
      description="Only official plugins are supported"
      eyebrow="Tools"
      data-testid="settings-plugins-page"
      actions={
        <Button
          variant="outline"
          size="icon"
          disabled={loading}
          aria-label="Refresh"
          title="Refresh"
          onClick={loadPlugins}
        >
          <Icon icon="lucide:refresh-cw" className="h-4 w-4" />
        </Button>
      }
    >
      {errorMessage && (
        <div className="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      <div className="space-y-3">
        {!loading && plugins.length === 0 && (
          <div className="flex flex-col gap-4 rounded-lg border border-dashed border-border bg-background p-6">
            <div className="flex items-start gap-3">
              <Icon icon="lucide:puzzle" className="mt-0.5 h-5 w-5 text-muted-foreground" />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">No plugins installed</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Plugins extend functionality. Install one to get started.
                </p>
              </div>
            </div>
          </div>
        )}

        {plugins.map((plugin) => (
          <article
            key={plugin.id}
            className="flex flex-col gap-4 rounded-lg border border-border bg-background p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-sm font-semibold">{plugin.name}</h3>
                  <span className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                    {plugin.version}
                  </span>
                </div>
                <div className="mt-1 truncate text-xs text-muted-foreground">
                  {plugin.publisher} · {plugin.id}
                </div>
              </div>
              <span
                className={`shrink-0 rounded border px-2 py-1 text-xs ${
                  plugin.enabled
                    ? 'border-emerald-500/40 text-emerald-600'
                    : 'border-border text-muted-foreground'
                }`}
              >
                {plugin.enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>

            <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Runtime</dt>
              <dd>{formatRuntimeState(plugin.runtime?.state)}</dd>
              <dt className="text-muted-foreground">Version</dt>
              <dd>{plugin.runtime?.version || '-'}</dd>
              <dt className="text-muted-foreground">Command</dt>
              <dd className="truncate font-mono text-xs">{plugin.runtime?.command || '-'}</dd>
            </dl>

            {plugin.runtime?.lastError && (
              <div className="text-xs text-destructive">{plugin.runtime.lastError}</div>
            )}

            {getPluginMcpErrors(plugin).length > 0 && (
              <div className="space-y-1 text-xs text-destructive">
                {getPluginMcpErrors(plugin).map((error) => (
                  <div key={error}>{error}</div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {!plugin.enabled && (
                <Button
                  data-testid={`plugin-enable-${plugin.id}`}
                  size="sm"
                  disabled={pendingPluginId === plugin.id}
                  onClick={() => void enablePlugin(plugin.id)}
                >
                  <Icon icon="lucide:power" className="mr-2 h-4 w-4" />
                  Enable
                </Button>
              )}
              {plugin.settings && (
                <Button
                  data-testid={`plugin-settings-${plugin.id}`}
                  size="sm"
                  variant="outline"
                  disabled={pendingPluginId === plugin.id}
                  onClick={() => void openSettings(plugin.id)}
                >
                  <Icon icon="lucide:settings" className="mr-2 h-4 w-4" />
                  Settings
                </Button>
              )}
              {plugin.enabled && (
                <Button
                  data-testid={`plugin-disable-${plugin.id}`}
                  size="sm"
                  variant="outline"
                  disabled={pendingPluginId === plugin.id}
                  onClick={() => void disablePlugin(plugin.id)}
                >
                  <Icon icon="lucide:power-off" className="mr-2 h-4 w-4" />
                  Disable
                </Button>
              )}
            </div>
          </article>
        ))}
      </div>
    </SettingsPageShell>
  )
}
