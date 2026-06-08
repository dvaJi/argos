import { uiSettingsStore, loadSettings } from '@/stores/uiSettingsStore'
import { providerStore, initialize as initializeProviders } from '@/stores/providerStore'
import { DEEPLINK_EVENTS } from '@/events'
import { createIpcSubscriptionScope } from '@/lib/ipcSubscription'
import { mcpStore } from '@/stores/mcp'
import { router } from '@/router'

export const initAppStores = async () => {
  console.info('[Startup][Renderer] initAppStores begin')

  await Promise.all([loadSettings(), initializeProviders()])
  console.info('[Startup][Renderer] initAppStores critical stores ready')
}

export const useMcpInstallDeeplinkHandler = () => {
  let cleanupIpcListeners: (() => void) | null = null

  const navigateToMcpSettings = async () => {
    const currentRoute = router.state.location
    const currentPath = currentRoute.pathname

    if (currentPath !== '/mcp') {
      await router.navigate({ to: '/mcp' })
    } else {
      await router.navigate({
        to: '/mcp',
        search: (prev: Record<string, unknown>) => prev,
        replace: true
      })
    }
  }

  const handleMcpInstall = async (_: unknown, data: Record<string, any>) => {
    const { mcpConfig } = data ?? {}
    if (!mcpConfig) return

    const state = mcpStore.state
    if (!state.mcpEnabled) {
      await mcpStore.setState((prev) => ({ ...prev, mcpEnabled: true }))
    }

    await navigateToMcpSettings()

    mcpStore.setState((prev) => ({ ...prev, mcpInstallCache: mcpConfig }))
  }

  const setup = () => {
    cleanupIpcListeners?.()
    const scope = createIpcSubscriptionScope()
    scope.on(DEEPLINK_EVENTS.MCP_INSTALL, handleMcpInstall)
    cleanupIpcListeners = scope.cleanup
  }

  const cleanup = () => {
    cleanupIpcListeners?.()
    cleanupIpcListeners = null
  }

  return { setup, cleanup }
}
