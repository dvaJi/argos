import { useState, useEffect, useMemo, useCallback } from 'react'
import { createConfigClient } from '@api/ConfigClient'
import { createModelClient } from '@api/ModelClient'

export type ChatMode = 'agent' | 'acp agent'

const MODE_ICONS = {
  agent: 'lucide:bot',
  'acp agent': 'lucide:bot-message-square'
} as const

const listeners = new Set<() => void>()
let sharedCurrentMode: ChatMode = 'agent'
let sharedHasAcpAgents = false
let hasLoaded = false
let loadPromise: Promise<void> | null = null
let modeUpdateVersion = 0
let hasAcpListener = false
const configClient = createConfigClient()
const modelClient = createModelClient()

function emitChange() {
  listeners.forEach((fn) => fn())
}

function useSharedState(): [ChatMode, boolean] {
  const [state, setState] = useState<[ChatMode, boolean]>([sharedCurrentMode, sharedHasAcpAgents])

  useEffect(() => {
    const handler = () => setState([sharedCurrentMode, sharedHasAcpAgents])
    listeners.add(handler)
    return () => {
      listeners.delete(handler)
    }
  }, [])

  return state
}

export function useChatMode() {
  const [currentMode, hasAcpAgents] = useSharedState()

  const currentIcon = MODE_ICONS[currentMode]
  const currentLabel = currentMode === 'agent' ? 'Agent' : 'ACP Agent'
  const modes = useMemo(() => {
    const allModes = [
      { value: 'agent' as ChatMode, label: 'Agent', icon: MODE_ICONS.agent },
      {
        value: 'acp agent' as ChatMode,
        label: 'ACP Agent',
        icon: MODE_ICONS['acp agent']
      }
    ]
    if (!hasAcpAgents) {
      return allModes.filter((mode) => mode.value !== 'acp agent')
    }
    return allModes
  }, [hasAcpAgents])

  const checkAcpAgents = useCallback(async () => {
    try {
      const acpEnabled = await configClient.getAcpEnabled()
      if (!acpEnabled) {
        sharedHasAcpAgents = false
        emitChange()
        return
      }
      const agents = await configClient.getAcpAgents()
      sharedHasAcpAgents = agents.length > 0
      emitChange()
    } catch (error) {
      console.warn('Failed to check ACP agents:', error)
      sharedHasAcpAgents = false
      emitChange()
    }
  }, [])

  const setMode = useCallback(async (mode: ChatMode) => {
    if (mode === 'acp agent' && !sharedHasAcpAgents) {
      console.warn('Cannot set acp agent mode: no ACP agents configured')
      return
    }

    const previousValue = sharedCurrentMode
    const updateVersion = ++modeUpdateVersion
    sharedCurrentMode = mode
    emitChange()

    try {
      await configClient.setSetting('input_chatMode', mode)
    } catch (error) {
      if (modeUpdateVersion === updateVersion) {
        sharedCurrentMode = previousValue
        emitChange()
      }
      console.error('Failed to save chat mode:', error)
    }
  }, [])

  const loadMode = useCallback(async () => {
    const loadVersion = modeUpdateVersion
    try {
      await checkAcpAgents()

      const saved = await configClient.getSetting('input_chatMode')
      if (modeUpdateVersion === loadVersion) {
        let savedMode: ChatMode = saved === 'acp agent' ? 'acp agent' : 'agent'

        if (saved === 'chat') {
          savedMode = 'agent'
          await configClient.setSetting('input_chatMode', 'agent')
        }

        if (savedMode === 'acp agent' && !sharedHasAcpAgents) {
          sharedCurrentMode = 'agent'
          await configClient.setSetting('input_chatMode', 'agent')
        } else {
          sharedCurrentMode = savedMode
        }
        emitChange()
      }
    } catch (error) {
      if (modeUpdateVersion === loadVersion) {
        sharedCurrentMode = 'agent'
        emitChange()
      }
      console.error('Failed to load chat mode, using default:', error)
    } finally {
      hasLoaded = true
    }
  }, [checkAcpAgents])

  useEffect(() => {
    const ensureLoaded = () => {
      if (hasLoaded) return
      if (!loadPromise) {
        loadPromise = loadMode().finally(() => {
          loadPromise = null
        })
      }
    }

    ensureLoaded()

    if (!hasAcpListener) {
      hasAcpListener = true
      modelClient.onModelsChanged(({ providerId }) => {
        if (!providerId || providerId === 'acp') {
          void checkAcpAgents()
        }
      })
      configClient.onAgentsChanged(() => {
        void checkAcpAgents()
      })
    }
  }, [loadMode, checkAcpAgents])

  useEffect(() => {
    if (!hasAcpAgents && currentMode === 'acp agent') {
      setMode('agent')
    }
  }, [hasAcpAgents, currentMode, setMode])

  const refreshAcpAgents = useCallback(async () => {
    await checkAcpAgents()
  }, [checkAcpAgents])

  return {
    currentMode,
    currentIcon,
    currentLabel,
    modes,
    setMode,
    loadMode,
    refreshAcpAgents
  }
}
