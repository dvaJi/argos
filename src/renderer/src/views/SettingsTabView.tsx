import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@tanstack/react-store'
import { Outlet, useRouterState } from '@tanstack/react-router'
import { pageRouterStore } from '@/stores/ui/pageRouter'
import { sessionStore } from '@/stores/ui/session'
import { agentStore, applyBootstrapAgents } from '@/stores/ui/agent'
import { projectStore, applyBootstrapDefaultProjectPath } from '@/stores/ui/project'
import { modelStore } from '@/stores/modelStore'
import { useOllamaStore } from '@/stores/ollamaStore'
import { useStartupWorkloadStore } from '@/stores/startupWorkloadStore'
import { createStartupClient } from '@api/StartupClient'
import ChatSidePanel from '@/components/sidepanel/ChatSidePanel'
import NewThreadPage from '@/pages/NewThreadPage'
import ChatPage from '@/pages/ChatPage'
import AgentWelcomePage from '@/pages/AgentWelcomePage'
import { markStartupInteractive, scheduleStartupDeferredTask } from '@/lib/startupDeferred'

const SETTINGS_TAB_TEST_IDS: Record<string, string> = {
  'settings-common': 'settings-tab-general',
  'settings-display': 'settings-tab-appearance',
  'settings-provider': 'settings-tab-model-providers',
  'settings-mcp': 'settings-tab-mcp',
  'settings-acp': 'settings-tab-acp-agents'
}

export function SettingsTabView() {
  const routerState = useRouterState()
  const [settings, setSettings] = useState<
    { title: string; name: string; icon: string; path: string }[]
  >([])

  useEffect(() => {
    const routes = [] as { title: string; name: string; icon: string; path: string }[]
    setSettings(routes)
  }, [])

  const getSettingsTabTestId = (name: string) =>
    SETTINGS_TAB_TEST_IDS[name] ?? `settings-tab-${name.replace(/^settings-/, '')}`

  const handleClick = (path: string) => {
    window.location.hash = path
  }

  return (
    <div
      data-testid="settings-page"
      className="w-full h-full flex flex-row bg-card mx-auto xl:max-w-6xl"
    >
      <div className="w-52 h-full border-r border-border p-2 space-y-2 shrink-0 overflow-y-auto">
        {settings.map((setting) => (
          <div
            key={setting.name}
            data-testid={getSettingsTabTestId(setting.name)}
            className={`flex flex-row items-center hover:bg-accent gap-2 rounded-lg p-2 ${
              routerState.location.pathname === setting.path ? 'bg-secondary' : ''
            }`}
            onClick={() => handleClick(setting.path)}
          >
            <span className="text-sm font-medium">{setting.title}</span>
          </div>
        ))}
      </div>
      <Outlet />
    </div>
  )
}
