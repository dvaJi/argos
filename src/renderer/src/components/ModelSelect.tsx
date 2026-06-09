import { useState, useMemo, useCallback } from 'react'
import { Input } from '@shadcn/components/ui/input'
import type { RENDERER_MODEL_META } from '@shared/presenter'
import { ModelType } from '@shared/model'
import ModelIcon from './icons/ModelIcon'
import { useProviderStore } from '@/stores/providerStore'
import { useModelStore } from '@/stores/modelStore'
import { useThemeStore } from '@/stores/theme'
import { useLanguageStore } from '@/stores/language'
import { useChatMode } from '@/components/chat-input/composables/useChatMode'

interface ModelSelectProps {
  type?: ModelType[]
  respectChatMode?: boolean
  excludeProviders?: string[]
  visionOnly?: boolean
  selectedProviderId?: string
  selectedModelId?: string
  onUpdateModel: (model: RENDERER_MODEL_META, providerId: string) => void
}

export default function ModelSelect({
  type,
  respectChatMode = true,
  excludeProviders = [],
  visionOnly = false,
  selectedProviderId = '',
  selectedModelId = '',
  onUpdateModel
}: ModelSelectProps) {
  const [keyword, setKeyword] = useState('')
  const providerStore = useProviderStore()
  const modelStore = useModelStore()
  const themeStore = useThemeStore()
  const langStore = useLanguageStore()
  const chatMode = useChatMode()

  const providers = useMemo(() => {
    const sortedProviders = providerStore.sortedProviders
    const enabledModels = modelStore.enabledModels
    const currentMode = chatMode.currentMode

    return sortedProviders
      .filter((provider) => provider.enable && !excludeProviders.includes(provider.id))
      .map((provider) => {
        if (respectChatMode) {
          if (currentMode === 'acp agent' && provider.id !== 'acp') return null
          if (currentMode !== 'acp agent' && provider.id === 'acp') return null
        }

        const enabledProvider = enabledModels.find((item) => item.providerId === provider.id)
        if (!enabledProvider || enabledProvider.models.length === 0) return null

        const filteredModels = enabledProvider.models.filter((model) => {
          const matchType =
            !type ||
            type.length === 0 ||
            (model.type !== undefined && type.includes(model.type as ModelType))
          const matchVision = !visionOnly || Boolean(model.vision)
          return matchType && matchVision
        })

        if (filteredModels.length === 0) return null

        return { id: provider.id, name: provider.name, models: filteredModels }
      })
      .filter(
        (provider): provider is { id: string; name: string; models: RENDERER_MODEL_META[] } =>
          provider !== null
      )
  }, [
    providerStore.sortedProviders,
    modelStore.enabledModels,
    chatMode.currentMode,
    type,
    respectChatMode,
    excludeProviders,
    visionOnly
  ])

  const filteredProviders = useMemo(() => {
    if (!keyword) return providers
    const lowerKeyword = keyword.toLowerCase()
    return providers
      .map((provider) => ({
        ...provider,
        models: provider.models.filter((model) => model.name.toLowerCase().includes(lowerKeyword))
      }))
      .filter((provider) => provider.models.length > 0)
  }, [providers, keyword])

  const isSelected = useCallback(
    (providerId: string, modelId: string) =>
      selectedProviderId === providerId && selectedModelId === modelId,
    [selectedProviderId, selectedModelId]
  )

  const handleModelSelect = useCallback(
    (providerId: string, model: RENDERER_MODEL_META) => {
      onUpdateModel(model, providerId)
    },
    [onUpdateModel]
  )

  return (
    <div className="space-y-2" dir={langStore.dir}>
      <Input
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        className="w-full rounded-b-none border-none border-b text-sm ring-0 focus-visible:ring-0"
        placeholder="Search models..."
      />
      <div className="flex max-h-64 flex-col overflow-y-auto">
        {filteredProviders.map((provider) => (
          <div key={provider.id}>
            <div className="px-2 text-xs text-muted-foreground">{provider.name}</div>
            <div className="p-1">
              {provider.models.map((model) => (
                <div
                  key={`${provider.id}-${model.id}`}
                  className={`flex flex-row items-center gap-1 rounded-md p-2 hover:bg-muted dark:hover:bg-accent${
                    isSelected(provider.id, model.id) ? ' bg-muted' : ''
                  }`}
                  onClick={() => handleModelSelect(provider.id, model)}
                >
                  <ModelIcon
                    modelId={provider.id === 'acp' ? model.id : provider.id}
                    isDark={themeStore.isDark}
                  />
                  <span className="flex-1 truncate text-xs font-bold">{model.name}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
