import { Store } from '@tanstack/store'
import { createProviderClient } from '../../api/ProviderClient'
import { createModelClient } from '../../api/ModelClient'
import type { OllamaModel } from '@shared/presenter'
import { useModelStore } from '@/stores/modelStore'
import { useProviderStore } from '@/stores/providerStore'

interface OllamaState {
  initializedProviderIds: Set<string>
  runningModels: Record<string, OllamaModel[]>
  localModels: Record<string, OllamaModel[]>
  pullingProgress: Record<string, Record<string, number>>
}

const providerClient = createProviderClient()
const modelClient = createModelClient()
let unsubscribeOllamaPullProgress: (() => void) | null = null
let unsubscribeModelsChanged: (() => void) | null = null
const runtimeSyncVersions = new Map<string, number>()

export const ollamaStore = new Store<OllamaState>({
  initializedProviderIds: new Set(),
  runningModels: {},
  localModels: {},
  pullingProgress: {}
})

export const setRunningModels = (providerId: string, models: OllamaModel[]) => {
  ollamaStore.setState((prev) => ({
    ...prev,
    runningModels: { ...prev.runningModels, [providerId]: models }
  }))
}

export const setLocalModels = (providerId: string, models: OllamaModel[]) => {
  ollamaStore.setState((prev) => ({
    ...prev,
    localModels: { ...prev.localModels, [providerId]: models }
  }))
}

export const updatePullingProgress = (providerId: string, modelName: string, progress?: number) => {
  ollamaStore.setState((prev) => {
    const current = prev.pullingProgress[providerId] ?? {}
    const next = { ...current }
    if (progress === undefined) {
      delete next[modelName]
    } else {
      next[modelName] = progress
    }

    const snapshot = { ...prev.pullingProgress }
    if (Object.keys(next).length > 0) {
      snapshot[providerId] = next
    } else {
      delete snapshot[providerId]
    }
    return { ...prev, pullingProgress: snapshot }
  })
}

export const getOllamaRunningModels = (providerId: string): OllamaModel[] =>
  ollamaStore.state.runningModels[providerId] || []

export const getOllamaLocalModels = (providerId: string): OllamaModel[] =>
  ollamaStore.state.localModels[providerId] || []

export const getOllamaPullingModels = (providerId: string): Record<string, number> =>
  ollamaStore.state.pullingProgress[providerId] || {}

const getNextRuntimeSyncVersion = (providerId: string) => {
  const version = (runtimeSyncVersions.get(providerId) ?? 0) + 1
  runtimeSyncVersions.set(providerId, version)
  return version
}

const isLatestRuntimeSync = (providerId: string, version: number) => {
  return runtimeSyncVersions.get(providerId) === version
}

export const syncOllamaRuntimeModels = async (
  providerId: string
): Promise<{ running: OllamaModel[]; local: OllamaModel[] }> => {
  const version = getNextRuntimeSyncVersion(providerId)

  const [running, local] = await Promise.all([
    providerClient.listOllamaRunningModels(providerId),
    providerClient.listOllamaModels(providerId)
  ])

  if (!isLatestRuntimeSync(providerId, version)) {
    return {
      running: getOllamaRunningModels(providerId),
      local: getOllamaLocalModels(providerId)
    }
  }

  setRunningModels(providerId, running)
  setLocalModels(providerId, local)
  return { running, local }
}

export const refreshOllamaModels = async (providerId: string): Promise<boolean> => {
  setupOllamaEventListeners()

  try {
    await syncOllamaRuntimeModels(providerId)
    await providerClient.refreshModels(providerId)
    await useModelStore().refreshProviderModels(providerId)
    await syncOllamaRuntimeModels(providerId)
    return true
  } catch {
    return false
  }
}

export const pullOllamaModel = async (providerId: string, modelName: string) => {
  setupOllamaEventListeners()

  try {
    updatePullingProgress(providerId, modelName, 0)
    const success = await providerClient.pullOllamaModels(providerId, modelName)
    if (!success) {
      updatePullingProgress(providerId, modelName)
    }
    return success
  } catch (error) {
    console.error('Failed to pull Ollama model', modelName, providerId, error)
    updatePullingProgress(providerId, modelName)
    return false
  }
}

export const handleOllamaModelPullEvent = (data: Record<string, unknown>) => {
  if (data?.eventId !== 'pullOllamaModels') return
  const providerId = data.providerId as string
  const modelName = data.modelName as string
  const completed = data.completed as number | undefined
  const total = data.total as number | undefined
  const status = data.status as string | undefined

  if (typeof completed === 'number' && typeof total === 'number' && total > 0) {
    const progress = Math.min(Math.round((completed / total) * 100), 100)
    updatePullingProgress(providerId, modelName, progress)
  } else if (status && status.includes('manifest')) {
    updatePullingProgress(providerId, modelName, 1)
  }

  if (status === 'success' || status === 'completed') {
    setTimeout(async () => {
      updatePullingProgress(providerId, modelName)
      await refreshOllamaModels(providerId)
    }, 600)
  }
}

export const setupOllamaEventListeners = () => {
  if (!unsubscribeModelsChanged && typeof modelClient.onModelsChanged === 'function') {
    unsubscribeModelsChanged = modelClient.onModelsChanged(({ providerId }) => {
      if (!providerId) return

      const provider = useProviderStore().providers.find((item) => item.id === providerId)
      if (provider?.apiType !== 'ollama') return

      void syncOllamaRuntimeModels(providerId).catch(() => {})
    })
  }

  if (!unsubscribeOllamaPullProgress && typeof providerClient.onOllamaPullProgress === 'function') {
    unsubscribeOllamaPullProgress = providerClient.onOllamaPullProgress((data) =>
      handleOllamaModelPullEvent(data)
    )
  }
}

export const removeOllamaEventListeners = () => {
  unsubscribeOllamaPullProgress?.()
  unsubscribeModelsChanged?.()
  unsubscribeOllamaPullProgress = null
  unsubscribeModelsChanged = null
}

export const clearOllamaProviderData = (providerId: string) => {
  ollamaStore.setState((prev) => {
    const nextRunning = { ...prev.runningModels }
    const nextLocal = { ...prev.localModels }
    const nextPulling = { ...prev.pullingProgress }
    let changed = false
    if (nextRunning[providerId]) {
      delete nextRunning[providerId]
      changed = true
    }
    if (nextLocal[providerId]) {
      delete nextLocal[providerId]
      changed = true
    }
    if (nextPulling[providerId]) {
      delete nextPulling[providerId]
      changed = true
    }
    if (!changed) return prev
    return {
      ...prev,
      runningModels: nextRunning,
      localModels: nextLocal,
      pullingProgress: nextPulling
    }
  })
}

export const isOllamaModelRunning = (providerId: string, modelName: string): boolean => {
  return getOllamaRunningModels(providerId).some((m) => m.name === modelName)
}

export const isOllamaModelLocal = (providerId: string, modelName: string): boolean => {
  return getOllamaLocalModels(providerId).some((m) => m.name === modelName)
}

export const initialize = async () => {
  setupOllamaEventListeners()
  const ollamaProviders = useProviderStore().providers.filter(
    (p) => p.apiType === 'ollama' && p.enable
  )
  for (const provider of ollamaProviders) {
    await ensureProviderReady(provider.id)
  }
}

export const ensureProviderReady = async (providerId: string) => {
  if (ollamaStore.state.initializedProviderIds.has(providerId)) {
    return
  }

  const refreshed = await refreshOllamaModels(providerId)
  if (refreshed) {
    ollamaStore.setState((prev) => ({
      ...prev,
      initializedProviderIds: new Set(prev.initializedProviderIds).add(providerId)
    }))
  }
}
