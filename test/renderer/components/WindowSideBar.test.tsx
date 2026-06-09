import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

vi.mock('@iconify/react', () => ({
  Icon: () => null
}))

type SetupOptions = {
  groupMode?: 'time' | 'project'
  selectedAgentId?: string | null
  enabledAgents?: Array<{ id: string; name: string; type?: 'deepchat' | 'acp'; enabled?: boolean }>
  activeSession?: { id: string; agentId: string } | null
  hasActiveSession?: boolean
  pinnedSessions?: Array<{ id: string; title: string; status: string; isPinned?: boolean }>
  groups?: Array<{
    id: string
    label: string
    labelKey?: string
    sessions: Array<{ id: string; title: string; status: string; isPinned?: boolean }>
  }>
  remoteStatus?: {
    enabled: boolean
    state: 'disabled' | 'stopped' | 'starting' | 'running' | 'backoff' | 'error'
  }
  collapsed?: boolean
  platform?: 'darwin' | 'win32' | 'linux'
}

const TEST_TIMEOUT_MS = 20000

const dispatchWindowKeydown = (
  key: string,
  modifiers: Partial<
    Pick<KeyboardEventInit, 'altKey' | 'ctrlKey' | 'metaKey' | 'repeat' | 'shiftKey'>
  > = {}
) =>
  window.dispatchEvent(
    new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ...modifiers
    })
  )

const dispatchWindowKeyup = (
  key: string,
  modifiers: Partial<
    Pick<KeyboardEventInit, 'altKey' | 'ctrlKey' | 'metaKey' | 'repeat' | 'shiftKey'>
  > = {}
) =>
  window.dispatchEvent(
    new KeyboardEvent('keyup', {
      key,
      bubbles: true,
      cancelable: true,
      ...modifiers
    })
  )

const cleanupFns: Array<() => void> = []

afterEach(() => {
  cleanupFns.splice(0).forEach((fn) => fn())
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const setup = async (options: SetupOptions = {}) => {
  vi.resetModules()
  vi.useFakeTimers()

  const operations: string[] = []
  const agentStore = {
    selectedAgentId: options.selectedAgentId ?? 'deepchat',
    selectedAgentName: 'DeepChat',
    enabledAgents: options.enabledAgents ?? [
      { id: 'acp-a', name: 'ACP A', type: 'acp' as const, enabled: true }
    ],
    setSelectedAgent: vi.fn((id: string | null) => {
      operations.push(`set:${id ?? 'all'}`)
      agentStore.selectedAgentId = id
    })
  }

  const sessionStore = {
    groupMode: options.groupMode ?? 'time',
    activeSessionId: options.activeSession?.id ?? 'session-1',
    activeSession: options.activeSession ?? null,
    hasActiveSession: options.hasActiveSession ?? true,
    startNewConversation: vi.fn().mockResolvedValue(undefined),
    selectSession: vi.fn(async (id: string) => {
      operations.push(`select:${id}`)
      sessionStore.activeSessionId = id
    }),
    closeSession: vi.fn(async () => {
      operations.push('close')
      sessionStore.hasActiveSession = false
      sessionStore.activeSessionId = null
    }),
    renameSession: vi.fn(),
    clearSessionMessages: vi.fn(),
    deleteSession: vi.fn(async (id: string) => {
      operations.push(`delete:${id}`)
    }),
    toggleSessionPinned: vi.fn(async (id: string, pinned: boolean) => {
      operations.push(`pin:${id}:${pinned}`)
    }),
    toggleGroupMode: vi.fn(),
    getPinnedSessions: vi.fn(() => options.pinnedSessions ?? []),
    getFilteredGroups: vi.fn(() => options.groups ?? [])
  }

  const themeStore = { isDark: false }
  const sidebarStore = {
    collapsed: options.collapsed ?? false,
    toggleSidebar: vi.fn(() => {
      sidebarStore.collapsed = !sidebarStore.collapsed
    }),
    setCollapsed: vi.fn((value: boolean) => {
      sidebarStore.collapsed = value
    })
  }
  const pageRouterStore = { goToNewThread: vi.fn() }
  const spotlightStore = {
    open: false,
    toggleSpotlight: vi.fn(() => {
      spotlightStore.open = !spotlightStore.open
    })
  }
  const settingsClient = {
    openSettings: vi.fn().mockResolvedValue({ windowId: 99 })
  }
  const deviceClient = {
    getDeviceInfo: vi.fn().mockResolvedValue({
      platform: options.platform ?? 'darwin',
      osVersion: '',
      osVersionMetadata: []
    })
  }

  vi.doMock('@/stores/ui/agent', () => ({
    useAgentStore: () => agentStore
  }))
  vi.doMock('@/stores/ui/session', () => ({
    useSessionStore: () => sessionStore
  }))
  vi.doMock('@/stores/ui/sidebar', () => ({
    useSidebarStore: () => sidebarStore
  }))
  vi.doMock('@/stores/theme', () => ({
    useThemeStore: () => themeStore
  }))
  vi.doMock('@/stores/ui/pageRouter', () => ({
    usePageRouterStore: () => pageRouterStore
  }))
  vi.doMock('@/stores/ui/spotlight', () => ({
    useSpotlightStore: () => spotlightStore
  }))
  vi.doMock('@api/SettingsClient', () => ({
    createSettingsClient: vi.fn(() => settingsClient)
  }))
  vi.doMock('@api/DeviceClient', () => ({
    createDeviceClient: vi.fn(() => deviceClient)
  }))

  const WindowSideBar = (await import('@/components/WindowSideBar')).default

  const result = render(<WindowSideBar />)

  await act(async () => {})

  return {
    ...result,
    operations,
    agentStore,
    sessionStore,
    settingsClient,
    deviceClient,
    spotlightStore,
    pageRouterStore,
    sidebarStore
  }
}

describe('WindowSideBar agent switch', () => {
  it(
    'delegates sidebar new chat clicks to the unified session action',
    async () => {
      const { sessionStore } = await setup()

      expect(sessionStore.startNewConversation).not.toHaveBeenCalled()
    },
    TEST_TIMEOUT_MS
  )

  it(
    'renders pinned sessions outside grouped sections',
    async () => {
      const { container } = await setup({
        pinnedSessions: [{ id: 'pinned-1', title: 'Pinned Session', status: 'none' }],
        groups: [
          {
            id: 'common.time.today',
            label: 'common.time.today',
            labelKey: 'common.time.today',
            sessions: [{ id: 'normal-1', title: 'Normal Session', status: 'none' }]
          }
        ]
      })

      expect(container).toHaveTextContent('Pinned Session')
      expect(container).toHaveTextContent('chat.sidebar.pinned')
      expect(container).toHaveTextContent('common.time.today')
      expect(container).toHaveTextContent('Normal Session')
    },
    TEST_TIMEOUT_MS
  )

  it(
    'toggles the shared sidebar store from the collapse button',
    async () => {
      const { container, sidebarStore } = await setup()

      const sidebar = screen.getByTestId('window-sidebar')
      expect([...sidebar.classList]).toContain('w-[288px]')

      await act(async () => {
        fireEvent.click(screen.getByTestId('window-sidebar-toggle'))
      })
      await act(async () => {})

      expect(sidebarStore.toggleSidebar).toHaveBeenCalledTimes(1)
    },
    TEST_TIMEOUT_MS
  )

  it(
    'keeps the sidebar search region interactive outside the drag area',
    async () => {
      const { container } = await setup()

      const sessionColumn = screen.getByTestId('window-sidebar-session-column')
      expect([...sessionColumn.classList]).toContain('window-no-drag-region')
      const search = screen.getByTestId('window-sidebar-search')
      expect([...search.classList]).toContain('window-no-drag-region')
    },
    TEST_TIMEOUT_MS
  )
})
