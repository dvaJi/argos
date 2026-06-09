import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useProviderStore } from '@/stores/providerStore'
import { useModelStore } from '@/stores/modelStore'
import { Icon } from '@iconify/react'
import ModelProviderSettingsDetail from './ModelProviderSettingsDetail'
import OllamaProviderSettingsDetail from './OllamaProviderSettingsDetail'
import BedrockProviderSettingsDetail from './BedrockProviderSettingsDetail'
import ModelIcon from '@/components/icons/ModelIcon'
import AddCustomProviderDialog from './AddCustomProviderDialog'
import type { AWS_BEDROCK_PROVIDER, LLM_PROVIDER } from '@shared/presenter'
import { Switch } from '@shadcn/components/ui/switch'
import { Input } from '@shadcn/components/ui/input'
import { Button } from '@shadcn/components/ui/button'
import { ScrollArea } from '@shadcn/components/ui/scroll-area'
import { useThemeStore } from '@/stores/theme'
import { useLanguageStore } from '@/stores/language'
import GuidedOnboardingOverlay from '@/components/onboarding/GuidedOnboardingOverlay'
import { useGuidedOnboardingStep } from '@/composables/useGuidedOnboardingStep'
import { useLegacyPresenter } from '@api/legacy/presenters'
import { continueGuidedOnboardingFromSettings } from '../lib/guidedOnboardingSettings'

interface ModelProviderSettingsProps {
  providerId?: string
  onNavigate?: (params: Record<string, string>) => void
}

export default function ModelProviderSettings({
  providerId: routeProviderId,
  onNavigate
}: ModelProviderSettingsProps) {
  const languageStore = useLanguageStore()
  const providerStore = useProviderStore()
  const modelStore = useModelStore()
  const themeStore = useThemeStore()
  const windowPresenter = useLegacyPresenter('windowPresenter')

  const guideRootRef = useRef<HTMLElement | null>(null)
  const providerDetailRef = useRef<HTMLElement | null>(null)
  const providerListGuideTargetRef = useRef<HTMLElement | null>(null)
  const providerApiKeyTargetRef = useRef<HTMLElement | null>(null)
  const providerModelTargetRef = useRef<HTMLElement | null>(null)

  const selectProviderGuide = useGuidedOnboardingStep('select-provider')
  const providerApiKeyGuide = useGuidedOnboardingStep('provider-api-key')
  const providerModelGuide = useGuidedOnboardingStep('provider-model')

  const [isAddProviderDialogOpen, setIsAddProviderDialogOpen] = useState(false)
  const [searchQueryBase, setSearchQueryBase] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const editInputRef = useRef<HTMLInputElement | null>(null)

  const showClearButton = searchQueryBase.trim().length > 0

  const showSelectProviderGuide =
    selectProviderGuide.showGuide.value && Boolean(providerListGuideTargetRef.current)
  const showProviderApiKeyGuide =
    providerApiKeyGuide.showGuide.value && Boolean(providerApiKeyTargetRef.current)
  const showProviderModelGuide =
    providerModelGuide.showGuide.value && Boolean(providerModelTargetRef.current)

  const detailGuideStepId = useMemo(() => {
    if (providerModelGuide.currentStepId.value === 'provider-model') return 'provider-model'
    if (providerApiKeyGuide.currentStepId.value === 'provider-api-key') return 'provider-api-key'
    return null
  }, [providerModelGuide.currentStepId.value, providerApiKeyGuide.currentStepId.value])

  let startupWorkloadStore: any = null
  try {
    const { useStartupWorkloadStore } = require('@/stores/startupWorkloadStore')
    startupWorkloadStore = useStartupWorkloadStore()
  } catch {
    // ignore
  }

  const continueProviderGuide = useCallback(
    async (state: any) => {
      await continueGuidedOnboardingFromSettings({
        state,
        router: {
          push: (params: any) => {
            if (onNavigate && params.params) onNavigate(params.params)
            return Promise.resolve()
          },
          replace: (params: any) => {
            if (onNavigate && params.params) onNavigate(params.params)
            return Promise.resolve()
          }
        },
        currentRoute: { params: { providerId: routeProviderId } },
        windowPresenter
      })
    },
    [onNavigate, routeProviderId, windowPresenter]
  )

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchQueryBase)
    }, 150)
    return () => clearTimeout(timer)
  }, [searchQueryBase])

  const clearSearch = () => {
    setSearchQueryBase('')
  }

  const filterProviders = (providers: LLM_PROVIDER[]) => {
    if (!searchQuery.trim()) return providers
    const query = searchQuery.toLowerCase().trim()
    return providers.filter((provider) => provider.name.toLowerCase().includes(query))
  }

  const visibleProviders = useMemo(
    () => providerStore.sortedProviders.filter((provider) => provider.id !== 'acp'),
    [providerStore.sortedProviders]
  )

  const allEnabledProviders = useMemo(
    () => visibleProviders.filter((p) => p.enable),
    [visibleProviders]
  )
  const allDisabledProviders = useMemo(
    () => visibleProviders.filter((p) => !p.enable),
    [visibleProviders]
  )

  const enabledProviders = useMemo(
    () => filterProviders(allEnabledProviders),
    [allEnabledProviders, searchQuery]
  )
  const disabledProviders = useMemo(
    () => filterProviders(allDisabledProviders),
    [allDisabledProviders, searchQuery]
  )

  const showProviderSkeleton =
    (!providerStore.initialized ||
      startupWorkloadStore?.isTaskRunning('settings.providers.summary')) &&
    visibleProviders.length === 0

  const activeProvider = useMemo(() => {
    const provider = providerStore.providers.find((p) => p.id === routeProviderId)
    if (provider?.id === 'acp') return null
    return provider
  }, [providerStore.providers, routeProviderId])

  const setActiveProvider = (id: string) => {
    onNavigate?.({ providerId: id })
  }

  const handleProviderRowClick = async (id: string) => {
    setActiveProvider(id)
  }

  const scrollToProvider = (id: string) => {
    const element = document.querySelector(`[data-provider-id="${id}"]`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }

  const toggleProviderStatus = async (provider: LLM_PROVIDER) => {
    const willEnable = !provider.enable
    await providerStore.updateProviderStatus(provider.id, willEnable)
    setActiveProvider(provider.id)
    if (willEnable) {
      setTimeout(() => scrollToProvider(provider.id), 100)
    }
  }

  const startEditingName = (provider: LLM_PROVIDER, event: React.MouseEvent) => {
    event.stopPropagation()
    setEditingProviderId(provider.id)
    setEditingName(provider.name)
    setTimeout(() => {
      editInputRef.current?.focus()
      editInputRef.current?.select()
    }, 0)
  }

  const saveEditingName = async () => {
    if (!editingProviderId || !editingName.trim()) {
      cancelEditingName()
      return
    }
    const trimmedName = editingName.trim()
    const providerId = editingProviderId
    setEditingProviderId(null)
    await providerStore.updateProviderConfig(providerId, { name: trimmedName })
  }

  const cancelEditingName = () => {
    setEditingProviderId(null)
    setEditingName('')
  }

  const handleEditKeydown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      void saveEditingName()
    } else if (event.key === 'Escape') {
      cancelEditingName()
    }
  }

  const handleProviderAdded = (provider: LLM_PROVIDER) => {
    setActiveProvider(provider.id)
  }

  const renderProviderRow = (provider: LLM_PROVIDER, dimmed: boolean = false) => (
    <div
      key={provider.id}
      data-provider-id={provider.id}
      ref={(el) => {
        if (provider.id === visibleProviders[0]?.id) {
          ;(providerListGuideTargetRef as any).current = el
        }
      }}
      className={`flex flex-row hover:bg-accent items-center gap-2 rounded-lg p-2 group ${
        dimmed ? 'opacity-60' : ''
      } ${routeProviderId === provider.id ? 'bg-accent text-accent-foreground' : ''}`}
      onClick={() => void handleProviderRowClick(provider.id)}
    >
      <Icon
        icon="lucide:grip-vertical"
        className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-move drag-handle"
      />
      <ModelIcon
        modelId={provider.id}
        customClass="w-4 h-4 text-muted-foreground"
        isDark={themeStore.isDark}
      />
      {editingProviderId === provider.id ? (
        <input
          ref={editInputRef}
          value={editingName}
          onChange={(e) => setEditingName(e.target.value)}
          className="text-sm font-medium flex-1 min-w-0 bg-background border border-input rounded px-2 py-0.5 outline-none focus:ring-1 focus:ring-ring"
          dir={languageStore.dir}
          onBlur={() => void saveEditingName()}
          onKeyDown={handleEditKeydown}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <>
          <span className="text-sm font-medium flex-1 min-w-0 truncate" dir={languageStore.dir}>
            {provider.name}
          </span>
          {provider.custom && (
            <Icon
              icon="lucide:pencil"
              className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-60 hover:opacity-100 shrink-0"
              onClick={(e) => startEditingName(provider, e as any)}
            />
          )}
        </>
      )}
      <Switch
        checked={provider.enable}
        onClick={(e) => {
          e.stopPropagation()
          void toggleProviderStatus(provider)
        }}
      />
    </div>
  )

  useEffect(() => {
    void providerStore.ensureInitialized()
    if (!routeProviderId && visibleProviders.length > 0) {
      setActiveProvider(visibleProviders[0].id)
    }
  }, [])

  useEffect(() => {
    if (routeProviderId) {
      void modelStore.ensureProviderModelsReady(routeProviderId)
    }
  }, [routeProviderId])

  if (showProviderSkeleton) {
    return (
      <div className="w-full h-full flex flex-row animate-pulse">
        <div className="w-80 h-full border-r p-4 space-y-3">
          <div className="h-9 rounded-md bg-muted/60" />
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={`provider-skeleton-${i}`} className="h-10 rounded-lg bg-muted/40" />
          ))}
          <div className="pt-2">
            <div className="h-10 rounded-lg bg-muted/50" />
          </div>
        </div>
        <div className="flex-1 p-6 space-y-4">
          <div className="h-6 w-48 rounded-md bg-muted/50" />
          <div className="h-24 rounded-xl bg-muted/40" />
          <div className="grid grid-cols-2 gap-4">
            <div className="h-20 rounded-xl bg-muted/40" />
            <div className="h-20 rounded-xl bg-muted/40" />
          </div>
          <div className="h-72 rounded-xl bg-muted/30" />
        </div>
      </div>
    )
  }

  return (
    <>
      <div
        ref={guideRootRef}
        data-testid="settings-provider-page"
        className="w-full h-full flex flex-row"
      >
        <ScrollArea className="w-80 border-r h-full">
          <div className="flex flex-col gap-4 p-4">
            <div className="flex flex-col gap-1">
              <h1 className="text-lg font-semibold">Model Providers</h1>
              <p className="text-xs text-muted-foreground">
                Configure your AI model providers and API keys.
              </p>
            </div>
            <div className="sticky top-4 z-10">
              <div className="relative">
                <Input
                  value={searchQueryBase}
                  onChange={(e) => setSearchQueryBase(e.target.value)}
                  placeholder="Search providers..."
                  className="h-9 pr-8 text-sm backdrop-blur-lg border-border"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') clearSearch()
                  }}
                />
                {!showClearButton ? (
                  <Icon
                    icon="lucide:search"
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
                  />
                ) : (
                  <Icon
                    icon="lucide:x"
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground hover:text-foreground cursor-pointer"
                    onClick={clearSearch}
                  />
                )}
              </div>
            </div>

            {enabledProviders.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="text-xs font-medium text-muted-foreground px-2">
                  Enabled ({enabledProviders.length})
                </div>
                <div className="space-y-2">
                  {enabledProviders.map((provider) => renderProviderRow(provider))}
                </div>
              </div>
            )}

            {disabledProviders.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="text-xs font-medium text-muted-foreground px-2">
                  Disabled ({disabledProviders.length})
                </div>
                <div className="space-y-2">
                  {disabledProviders.map((provider) => renderProviderRow(provider, true))}
                </div>
              </div>
            )}

            <div className="sticky bottom-4 z-10" dir={languageStore.dir}>
              <Button
                data-testid="provider-add-button"
                variant="outline"
                className="w-full flex flex-row items-center gap-2 rounded-lg p-2 backdrop-blur-lg hover:bg-accent"
                onClick={() => setIsAddProviderDialogOpen(true)}
              >
                <Icon icon="lucide:plus" className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Add Custom Provider</span>
              </Button>
            </div>
          </div>
        </ScrollArea>

        {activeProvider && (
          <div ref={providerDetailRef} className="flex min-w-0 flex-1">
            {activeProvider.apiType === 'ollama' ? (
              <OllamaProviderSettingsDetail
                key={`ollama-${activeProvider.id}`}
                provider={activeProvider}
                className="flex-1"
                onProviderConfigured={() => {}}
                onProviderModelEnabled={() => {}}
              />
            ) : activeProvider.apiType === 'aws-bedrock' ? (
              <BedrockProviderSettingsDetail
                key={`bedrock-${activeProvider.id}`}
                provider={activeProvider as AWS_BEDROCK_PROVIDER}
                className="flex-1"
                onProviderConfigured={() => {}}
                onProviderModelEnabled={() => {}}
              />
            ) : (
              <ModelProviderSettingsDetail
                key={`standard-${activeProvider.id}`}
                provider={activeProvider}
                activeOnboardingStepId={detailGuideStepId}
                onProviderConfigured={() => {}}
                onProviderModelEnabled={() => {}}
              />
            )}
          </div>
        )}

        <AddCustomProviderDialog
          open={isAddProviderDialogOpen}
          onOpenChange={setIsAddProviderDialogOpen}
          onProviderAdded={handleProviderAdded}
        />
      </div>

      {showSelectProviderGuide && (
        <GuidedOnboardingOverlay
          visible={showSelectProviderGuide}
          containerEl={guideRootRef.current}
          targetEl={providerListGuideTargetRef.current}
          eyebrow="Getting Started"
          title="Select a Provider"
          description="Configure your AI model providers and API keys."
          stepIndex={selectProviderGuide.stepIndex.value}
          totalSteps={selectProviderGuide.totalSteps.value}
          closeLabel="Close"
          backLabel={selectProviderGuide.canGoPrevious?.value ? 'Back' : undefined}
          expertLabel="Skip all"
          primaryLabel="Next"
          primaryDisabled={!Boolean(activeProvider ?? visibleProviders[0])}
          onClose={selectProviderGuide.dismissGuide}
          onBack={async () => {
            const state = await selectProviderGuide.activatePreviousStep()
            await continueProviderGuide(state)
          }}
          onExpert={async () => {
            const state = await selectProviderGuide.forceComplete()
            await continueProviderGuide(state)
          }}
          onPrimary={async () => {
            const firstProviderId = visibleProviders[0]?.id
            if (firstProviderId && activeProvider?.id !== firstProviderId) {
              setActiveProvider(firstProviderId)
            }
            const state = await selectProviderGuide.completeStep()
            await continueProviderGuide(state)
          }}
        />
      )}

      {showProviderApiKeyGuide && (
        <GuidedOnboardingOverlay
          visible={showProviderApiKeyGuide}
          containerEl={guideRootRef.current}
          targetEl={providerApiKeyTargetRef.current}
          eyebrow="Getting Started"
          title="Enter API Key"
          description="Configure your AI model providers and API keys."
          stepIndex={providerApiKeyGuide.stepIndex.value}
          totalSteps={providerApiKeyGuide.totalSteps.value}
          closeLabel="Close"
          backLabel={providerApiKeyGuide.canGoPrevious?.value ? 'Back' : undefined}
          secondaryLabel="Skip"
          expertLabel="Skip all"
          primaryLabel="Next"
          primaryDisabled={!Boolean(activeProvider?.apiKey?.trim())}
          onClose={providerApiKeyGuide.dismissGuide}
          onBack={async () => {
            const state = await providerApiKeyGuide.activatePreviousStep()
            await continueProviderGuide(state)
          }}
          onSecondary={async () => {
            const skippedState = await providerApiKeyGuide.skipStep()
            if (skippedState?.currentStepId === 'provider-model') {
              const skippedModelState = await providerModelGuide.skipStep()
              await continueProviderGuide(skippedModelState)
              return
            }
            await continueProviderGuide(skippedState)
          }}
          onExpert={async () => {
            const state = await providerApiKeyGuide.forceComplete()
            await continueProviderGuide(state)
          }}
          onPrimary={async () => {
            const state = await providerApiKeyGuide.completeStep()
            await continueProviderGuide(state)
          }}
        />
      )}

      {showProviderModelGuide && (
        <GuidedOnboardingOverlay
          visible={showProviderModelGuide}
          containerEl={guideRootRef.current}
          targetEl={providerModelTargetRef.current}
          eyebrow="Getting Started"
          title="Models"
          description="Configure your AI model providers and API keys."
          stepIndex={providerModelGuide.stepIndex.value}
          totalSteps={providerModelGuide.totalSteps.value}
          closeLabel="Close"
          backLabel={providerModelGuide.canGoPrevious?.value ? 'Back' : undefined}
          secondaryLabel="Skip"
          expertLabel="Skip all"
          primaryLabel="Next"
          primaryDisabled={false}
          onClose={providerModelGuide.dismissGuide}
          onBack={async () => {
            const state = await providerModelGuide.activatePreviousStep()
            await continueProviderGuide(state)
          }}
          onSecondary={async () => {
            const state = await providerModelGuide.skipStep()
            await continueProviderGuide(state)
          }}
          onExpert={async () => {
            const state = await providerModelGuide.forceComplete()
            await continueProviderGuide(state)
          }}
          onPrimary={async () => {
            const state = await providerModelGuide.completeStep()
            await continueProviderGuide(state)
          }}
        />
      )}
    </>
  )
}
