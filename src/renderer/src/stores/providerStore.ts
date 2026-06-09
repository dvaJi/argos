import { Store } from '@tanstack/store'
import { useStore } from '@tanstack/react-store'
import { createProviderClient } from '../../api/ProviderClient'
import { createConfigClient } from '../../api/ConfigClient'
import type { AWS_BEDROCK_PROVIDER, LLM_PROVIDER, VERTEX_PROVIDER } from '@shared/presenter'

type VoiceAIConfig = {
  audioFormat: string
  model: string
  language: string
  temperature: number
  topP: number
  agentId: string
}

const PROVIDER_ORDER_KEY = 'providerOrder'
const PROVIDER_TIMESTAMP_KEY = 'providerTimestamps'

const configClient = createConfigClient()
const providerClient = createProviderClient()

export const providerStore = new Store({
  providers: [] as LLM_PROVIDER[],
  defaultProviders: [] as LLM_PROVIDER[],
  providerOrder: [] as string[],
  providerTimestamps: {} as Record<string, number>,
  listenersRegistered: false,
  voiceAIConfig: null as VoiceAIConfig | null,
  initialized: false,
  initializationPromise: null as Promise<void> | null
})

export const getEnabledProviders = () => providerStore.state.providers.filter((p) => p.enable)
export const getDisabledProviders = () => providerStore.state.providers.filter((p) => !p.enable)

const ensureOrderIncludesProviders = (order: string[], list: LLM_PROVIDER[]) => {
  const seen = new Set<string>()
  const cleanedOrder: string[] = []
  order.forEach((id) => {
    if (!id || seen.has(id)) return
    seen.add(id)
    cleanedOrder.push(id)
  })

  list.forEach((provider) => {
    if (!seen.has(provider.id)) {
      seen.add(provider.id)
      cleanedOrder.push(provider.id)
    }
  })

  return cleanedOrder
}

const sortProviders = (providerList: LLM_PROVIDER[], useAscendingTime: boolean) => {
  return [...providerList].sort((a, b) => {
    const order = providerStore.state.providerOrder
    const timestamps = providerStore.state.providerTimestamps
    const aOrderIndex = order.indexOf(a.id)
    const bOrderIndex = order.indexOf(b.id)
    if (aOrderIndex !== -1 && bOrderIndex !== -1) {
      return aOrderIndex - bOrderIndex
    }
    if (aOrderIndex !== -1) {
      return -1
    }
    if (bOrderIndex !== -1) {
      return 1
    }
    const aTime = timestamps[a.id] || 0
    const bTime = timestamps[b.id] || 0
    return useAscendingTime ? aTime - bTime : bTime - aTime
  })
}

export const getSortedProviders = () => {
  const sortedEnabled = sortProviders(getEnabledProviders(), true)
  const sortedDisabled = sortProviders(getDisabledProviders(), false)
  return [...sortedEnabled, ...sortedDisabled]
}

export const loadProviderOrder = async () => {
  try {
    const savedOrder = await configClient.getSetting(PROVIDER_ORDER_KEY)
    if (savedOrder && savedOrder.length > 0) {
      providerStore.setState((prev) => ({
        ...prev,
        providerOrder: ensureOrderIncludesProviders(savedOrder, prev.providers)
      }))
    } else if (
      providerStore.state.providerOrder.length === 0 &&
      providerStore.state.providers.length > 0
    ) {
      providerStore.setState((prev) => ({
        ...prev,
        providerOrder: prev.providers.map((provider) => provider.id)
      }))
    }
  } catch (error) {
    console.error('Failed to load provider order:', error)
    if (providerStore.state.providerOrder.length === 0) {
      providerStore.setState((prev) => ({
        ...prev,
        providerOrder: prev.providers.map((provider) => provider.id)
      }))
    }
  }
}

export const saveProviderOrder = async () => {
  try {
    if (providerStore.state.providerOrder.length > 0) {
      await configClient.setSetting(PROVIDER_ORDER_KEY, [...providerStore.state.providerOrder])
    }
  } catch (error) {
    console.error('Failed to save provider order:', error)
  }
}

export const loadProviderTimestamps = async () => {
  try {
    const savedTimestamps = await configClient.getSetting(PROVIDER_TIMESTAMP_KEY)
    providerStore.setState((prev) => ({
      ...prev,
      providerTimestamps: savedTimestamps ?? {}
    }))
  } catch (error) {
    console.error('Failed to load provider timestamps:', error)
    providerStore.setState((prev) => ({ ...prev, providerTimestamps: {} }))
  }
}

export const saveProviderTimestamps = async () => {
  try {
    await configClient.setSetting(PROVIDER_TIMESTAMP_KEY, {
      ...providerStore.state.providerTimestamps
    })
  } catch (error) {
    console.error('Failed to save provider timestamps:', error)
  }
}

async function loadProviders(): Promise<void> {
  const data = await providerClient.getProviderSummaries()
  providerStore.setState((prev) => ({ ...prev, providers: data as LLM_PROVIDER[] }))
  scheduleProviderOrderSync()
}

async function loadDefaultProviders(): Promise<void> {
  const data = await providerClient.getDefaultProviders()
  providerStore.setState((prev) => ({ ...prev, defaultProviders: data as LLM_PROVIDER[] }))
}

export const refreshProviders = async () => {
  await loadProviderOrder()
  await loadProviders()
}

export const ensureDefaultProvidersReady = async () => {
  if (providerStore.state.defaultProviders.length > 0) {
    return
  }

  await loadDefaultProviders()
}

export const setupProviderListeners = () => {
  if (providerStore.state.listenersRegistered) return
  providerStore.setState((prev) => ({ ...prev, listenersRegistered: true }))

  providerClient.onProvidersChanged(async () => {
    await refreshProviders()
  })
}

export const updateProvider = async (id: string, provider: LLM_PROVIDER) => {
  const current = providerStore.state.providers.find((item) => item.id === id)
  const previousEnable = current?.enable
  const next = { ...provider }
  delete (next as any).websites
  await providerClient.setProviderById(id, next)
  await refreshProviders()
  return { previousEnable, next }
}

export const updateProviderConfig = async (providerId: string, updates: Partial<LLM_PROVIDER>) => {
  const currentProvider = providerStore.state.providers.find((p) => p.id === providerId)
  if (!currentProvider) {
    throw new Error(`Provider ${providerId} not found`)
  }

  const requiresRebuild = await providerClient.updateProviderAtomic(providerId, updates)
  await refreshProviders()
  return { requiresRebuild, updated: { ...currentProvider, ...updates } }
}

export const updateProviderApi = async (providerId: string, apiKey?: string, baseUrl?: string) => {
  const updates: Partial<LLM_PROVIDER> = {}
  if (apiKey !== undefined) updates.apiKey = apiKey
  if (baseUrl !== undefined) updates.baseUrl = baseUrl
  return updateProviderConfig(providerId, updates)
}

export const updateProvidersOrder = async (newProviders: LLM_PROVIDER[]) => {
  try {
    const enabledList = newProviders.filter((provider) => provider.enable)
    const disabledList = newProviders.filter((provider) => !provider.enable)
    const newOrder = [...enabledList.map((p) => p.id), ...disabledList.map((p) => p.id)]
    const allIds = providerStore.state.providers.map((provider) => provider.id)
    const missingIds = allIds.filter((id) => !newOrder.includes(id))
    providerStore.setState((prev) => ({
      ...prev,
      providerOrder: [...newOrder, ...missingIds]
    }))
    await saveProviderOrder()
    await providerClient.reorderProvidersAtomic(newProviders)
    await refreshProviders()
  } catch (error) {
    console.error('Failed to update provider order:', error)
    throw error
  }
}

export const optimizeProviderOrder = async (providerId: string, enable: boolean) => {
  try {
    const currentOrder = [...providerStore.state.providerOrder]
    const index = currentOrder.indexOf(providerId)
    if (index !== -1) {
      currentOrder.splice(index, 1)
    }
    const availableProviders = providerStore.state.providers
    const enabledOrder: string[] = []
    const disabledOrder: string[] = []
    currentOrder.forEach((id) => {
      const provider = availableProviders.find((item) => item.id === id)
      if (!provider || provider.id === providerId) return
      if (provider.enable) {
        enabledOrder.push(id)
      } else {
        disabledOrder.push(id)
      }
    })
    const newOrder = enable
      ? [...enabledOrder, providerId, ...disabledOrder]
      : [...enabledOrder, providerId, ...disabledOrder]
    const missingIds = availableProviders.map((p) => p.id).filter((id) => !newOrder.includes(id))
    providerStore.setState((prev) => ({
      ...prev,
      providerOrder: [...newOrder, ...missingIds]
    }))
    await saveProviderOrder()
  } catch (error) {
    console.error('Failed to optimize provider order:', error)
  }
}

export const updateProviderStatus = async (providerId: string, enable: boolean) => {
  const previousTimestamp = providerStore.state.providerTimestamps[providerId]
  providerStore.setState((prev) => ({
    ...prev,
    providerTimestamps: { ...prev.providerTimestamps, [providerId]: Date.now() }
  }))
  try {
    await saveProviderTimestamps()
    await updateProviderConfig(providerId, { enable })
    await optimizeProviderOrder(providerId, enable)
  } catch (error) {
    if (previousTimestamp === undefined) {
      providerStore.setState((prev) => {
        const next = { ...prev.providerTimestamps }
        delete next[providerId]
        return { ...prev, providerTimestamps: next }
      })
    } else {
      providerStore.setState((prev) => ({
        ...prev,
        providerTimestamps: { ...prev.providerTimestamps, [providerId]: previousTimestamp }
      }))
    }
    await saveProviderTimestamps()
    throw error
  }
}

export const addCustomProvider = async (provider: LLM_PROVIDER) => {
  const newProvider = { ...provider, custom: true }
  delete (newProvider as any).websites
  await providerClient.addProviderAtomic(newProvider)
  await refreshProviders()
}

export const removeProvider = async (providerId: string) => {
  await providerClient.removeProviderAtomic(providerId)
  providerStore.setState((prev) => ({
    ...prev,
    providerOrder: prev.providerOrder.filter((id) => id !== providerId)
  }))
  await saveProviderOrder()
  await refreshProviders()
}

export const updateAwsBedrockProviderConfig = async (
  providerId: string,
  updates: Partial<AWS_BEDROCK_PROVIDER>
) => {
  return updateProviderConfig(providerId, updates)
}

export const updateVertexProviderConfig = async (
  providerId: string,
  updates: Partial<VERTEX_PROVIDER>
) => {
  return updateProviderConfig(providerId, updates)
}

export const checkProvider = async (providerId: string, modelId?: string) => {
  return await providerClient.testConnection({ providerId, modelId })
}

export const setAzureApiVersion = async (version: string) => {
  await configClient.setAzureApiVersion(version)
}

export const getAzureApiVersion = async (): Promise<string> => {
  return await configClient.getAzureApiVersion()
}

export const setGeminiSafety = async (
  key: string,
  value:
    | 'BLOCK_NONE'
    | 'BLOCK_ONLY_HIGH'
    | 'BLOCK_MEDIUM_AND_ABOVE'
    | 'BLOCK_LOW_AND_ABOVE'
    | 'HARM_BLOCK_THRESHOLD_UNSPECIFIED'
) => {
  await configClient.setGeminiSafety(key, value)
}

export const getGeminiSafety = async (key: string): Promise<string> => {
  return await configClient.getGeminiSafety(key)
}

export const setAwsBedrockCredential = async (credential: unknown) => {
  await configClient.setAwsBedrockCredential(credential)
}

export const getAwsBedrockCredential = async () => {
  return await configClient.getAwsBedrockCredential()
}

export const getVoiceAIConfig = async (): Promise<VoiceAIConfig> => {
  const config = await configClient.getVoiceAIConfig()
  providerStore.setState((prev) => ({ ...prev, voiceAIConfig: config }))
  return config
}

export const updateVoiceAIConfig = async (updates: Partial<VoiceAIConfig>) => {
  await configClient.updateVoiceAIConfig(updates)
  await getVoiceAIConfig()
}

export const updateProviderTimestamp = async (providerId: string) => {
  providerStore.setState((prev) => ({
    ...prev,
    providerTimestamps: { ...prev.providerTimestamps, [providerId]: Date.now() }
  }))
  await saveProviderTimestamps()
}

export const initialize = async () => {
  if (providerStore.state.initialized) {
    return
  }

  if (providerStore.state.initializationPromise) {
    await providerStore.state.initializationPromise
    return
  }

  const promise = (async () => {
    await loadProviderTimestamps()
    await loadProviderOrder()
    setupProviderListeners()
    await refreshProviders()
    providerStore.setState((prev) => ({ ...prev, initialized: true }))
  })()
  providerStore.setState((prev) => ({ ...prev, initializationPromise: promise }))

  try {
    await promise
  } finally {
    if (!providerStore.state.initialized) {
      providerStore.setState((prev) => ({ ...prev, initializationPromise: null }))
    }
  }
}

export const ensureInitialized = async () => {
  await initialize()
}

export const primeProviders = async () => {
  setupProviderListeners()
  await loadProviders()
  await loadProviderOrder()
  await loadProviderTimestamps()
}

let providerOrderSyncTimer: ReturnType<typeof setTimeout> | null = null

function scheduleProviderOrderSync(): void {
  const list = providerStore.state.providers
  if (!list || list.length === 0) return
  if (providerStore.state.providerOrder.length === 0) {
    void loadProviderOrder()
    return
  }

  if (providerOrderSyncTimer) {
    clearTimeout(providerOrderSyncTimer)
  }

  providerOrderSyncTimer = setTimeout(() => {
    const ensured = ensureOrderIncludesProviders(providerStore.state.providerOrder, list)
    const isSameLength = ensured.length === providerStore.state.providerOrder.length
    const isSameOrder =
      isSameLength && ensured.every((id, idx) => id === providerStore.state.providerOrder[idx])

    if (!isSameOrder) {
      providerStore.setState((prev) => ({ ...prev, providerOrder: ensured }))
      void saveProviderOrder()
    }
  }, 80)
}

export function useProviderStore() {
  const state = useStore(providerStore)
  return {
    ...state,
    getEnabledProviders,
    getDisabledProviders,
    getSortedProviders,
    loadProviderOrder,
    saveProviderOrder,
    loadProviderTimestamps,
    saveProviderTimestamps,
    refreshProviders,
    ensureDefaultProvidersReady,
    setupProviderListeners,
    updateProvider,
    updateProviderConfig,
    updateProviderApi,
    updateProvidersOrder,
    optimizeProviderOrder,
    updateProviderStatus,
    addCustomProvider,
    removeProvider,
    updateAwsBedrockProviderConfig,
    updateVertexProviderConfig,
    checkProvider,
    setAzureApiVersion,
    getAzureApiVersion,
    setGeminiSafety,
    getGeminiSafety,
    setAwsBedrockCredential,
    getAwsBedrockCredential,
    getVoiceAIConfig,
    updateVoiceAIConfig,
    updateProviderTimestamp,
    initialize,
    ensureInitialized,
    primeProviders
  }
}
