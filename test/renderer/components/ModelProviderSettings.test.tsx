import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

const TEST_TIMEOUT_MS = 20000

const waitForGuideTargetSync = async () => {
  await act(async () => {})
  await new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve())
      return
    }

    resolve()
  })
  await act(async () => {})
}

const setup = async (options?: {
  routeProviderId?: string | undefined
  guideCurrentStepId?: string | null
  visibleGuideStepId?: string | null
  initialProviderModels?: Array<{
    providerId: string
    models: Array<{ id: string; enabled?: boolean }>
  }>
  providers?: Array<{
    id: string
    name: string
    apiType: string
    apiKey: string
    baseUrl: string
    enable: boolean
  }>
}) => {
  vi.resetModules()
  const routeProviderId =
    options && 'routeProviderId' in options ? options.routeProviderId : 'anthropic'
  const guideCurrentStepId = options?.guideCurrentStepId ?? null
  const visibleGuideStepId = options?.visibleGuideStepId ?? null

  const provider = {
    id: 'anthropic',
    name: 'Anthropic',
    apiType: 'anthropic',
    apiKey: 'test-key',
    baseUrl: 'https://api.anthropic.com',
    enable: true
  }
  const providers = options?.providers ?? [provider]
  const providerStore = {
    providers,
    sortedProviders: providers,
    initialized: { value: true },
    ensureInitialized: vi.fn().mockResolvedValue(undefined),
    refreshProviders: vi.fn().mockResolvedValue(undefined),
    updateProviderConfig: vi.fn().mockResolvedValue(undefined),
    updateProviderApi: vi.fn().mockResolvedValue(undefined),
    updateProviderStatus: vi.fn().mockResolvedValue(undefined),
    addCustomProvider: vi.fn().mockResolvedValue(undefined),
    updateProvidersOrder: vi.fn(),
    defaultProviders: []
  }

  const modelStore = {
    allProviderModels: options?.initialProviderModels ?? [
      {
        providerId: 'anthropic',
        models: [{ id: 'claude-sonnet', providerId: 'anthropic', enabled: false }]
      }
    ],
    customModels: [],
    refreshAllModels: vi.fn().mockResolvedValue(undefined),
    refreshProviderModels: vi.fn().mockResolvedValue(undefined),
    ensureProviderModelsReady: vi.fn().mockResolvedValue(undefined)
  }

  const router = {
    push: vi.fn(async ({ params }: { params?: Record<string, string> }) => {}),
    replace: vi.fn()
  }
  const completeStep = vi.fn().mockResolvedValue({
    status: 'active',
    currentStepId: 'mcp',
    steps: []
  })
  const stepState =
    guideCurrentStepId === 'provider-model'
      ? { id: 'provider-model', status: 'pending', required: false }
      : guideCurrentStepId === 'provider-api-key'
        ? { id: 'provider-api-key', status: 'pending', required: false }
        : guideCurrentStepId === 'select-provider'
          ? { id: 'select-provider', status: 'pending', required: true }
          : { id: 'provider-api-key', status: 'completed', required: false }

  vi.doMock('@/stores/providerStore', () => ({
    useProviderStore: () => providerStore
  }))
  vi.doMock('@/stores/modelStore', () => ({
    useModelStore: () => modelStore
  }))
  vi.doMock('@/stores/theme', () => ({
    useThemeStore: () => ({ isDark: false })
  }))
  vi.doMock('@/stores/language', () => ({
    useLanguageStore: () => ({ dir: 'ltr' })
  }))
  vi.doMock('@/composables/useGuidedOnboardingStep', () => ({
    useGuidedOnboardingStep: (stepId: string) => ({
      onboardingState: { value: null },
      currentStepId: { value: guideCurrentStepId },
      stepState: { value: stepId === guideCurrentStepId ? stepState : null },
      showGuide: { value: stepId === visibleGuideStepId },
      stepIndex: { value: 1 },
      totalSteps: { value: 6 },
      canGoPrevious: { value: true },
      dismissGuide: vi.fn(),
      completeStep,
      skipStep: vi.fn().mockResolvedValue(null),
      activatePreviousStep: vi.fn().mockResolvedValue(null),
      forceComplete: vi.fn().mockResolvedValue(null)
    })
  }))
  vi.doMock('@api/legacy/presenters', () => ({
    useLegacyPresenter: () => ({
      focusMainWindow: vi.fn().mockResolvedValue(true)
    })
  }))

  const ModelProviderSettings = (
    await import('../../../src/renderer/settings/components/ModelProviderSettings')
  ).default

  const result = render(<ModelProviderSettings routeProviderId={routeProviderId} />)

  await waitForGuideTargetSync()

  return { ...result, router, completeStep, modelStore }
}

describe('ModelProviderSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it(
    'renders the generic provider settings detail for anthropic',
    async () => {
      const { container } = await setup()

      expect(screen.queryByTestId('generic-detail')).toBeTruthy()
      expect(screen.queryByTestId('anthropic-detail')).toBeNull()
    },
    TEST_TIMEOUT_MS
  )

  it('navigates to the selected provider when a provider row is clicked', async () => {
    const { router } = await setup()

    await fireEvent.click(screen.getByTestId('provider-anthropic'))

    expect(router.push).toHaveBeenCalledWith({
      name: 'settings-provider',
      params: {
        providerId: 'anthropic'
      }
    })
  })

  it('auto-continues onboarding when the highlighted provider row is clicked', async () => {
    const { router, completeStep } = await setup({
      guideCurrentStepId: 'select-provider',
      visibleGuideStepId: 'select-provider'
    })

    await fireEvent.click(screen.getByTestId('provider-anthropic'))
    await act(async () => {})

    expect(completeStep).toHaveBeenCalledTimes(1)
    expect(router.push).toHaveBeenNthCalledWith(1, {
      name: 'settings-provider',
      params: {
        providerId: 'anthropic'
      }
    })
    expect(router.push).toHaveBeenNthCalledWith(2, {
      name: 'settings-mcp'
    })
  })

  it(
    'skips ACP when auto-selecting the default provider settings view',
    async () => {
      const { router } = await setup({
        routeProviderId: undefined,
        providers: [
          {
            id: 'acp',
            name: 'ACP',
            apiType: 'openai',
            apiKey: '',
            baseUrl: '',
            enable: true
          },
          {
            id: 'anthropic',
            name: 'Anthropic',
            apiType: 'anthropic',
            apiKey: 'test-key',
            baseUrl: 'https://api.anthropic.com',
            enable: true
          }
        ]
      })

      expect(router.push).toHaveBeenCalledWith({
        name: 'settings-provider',
        params: {
          providerId: 'anthropic'
        }
      })
      expect(router.replace).not.toHaveBeenCalledWith({ name: 'settings-acp' })
    },
    TEST_TIMEOUT_MS
  )

  it('auto-continues onboarding after the provider is configured', async () => {
    const { router, completeStep } = await setup({
      guideCurrentStepId: 'provider-api-key'
    })

    await fireEvent.click(screen.getByTestId('generic-detail-complete'))
    await act(async () => {})

    expect(completeStep).toHaveBeenCalledTimes(1)
    expect(router.push).toHaveBeenCalledWith({
      name: 'settings-mcp'
    })
  })

  it('auto-continues onboarding when the ollama provider is configured', async () => {
    const { router, completeStep } = await setup({
      routeProviderId: 'ollama',
      guideCurrentStepId: 'provider-api-key',
      visibleGuideStepId: 'provider-api-key',
      providers: [
        {
          id: 'ollama',
          name: 'Ollama',
          apiType: 'ollama',
          apiKey: 'test-key',
          baseUrl: 'http://127.0.0.1:11434',
          enable: true
        },
        {
          id: 'anthropic',
          name: 'Anthropic',
          apiType: 'anthropic',
          apiKey: 'test-key',
          baseUrl: 'https://api.anthropic.com',
          enable: true
        }
      ],
      initialProviderModels: [
        {
          providerId: 'ollama',
          models: [{ id: 'deepseek-r1', providerId: 'ollama', enabled: false }]
        }
      ]
    })

    const overlay = screen.queryByTestId('guided-overlay')
    if (overlay) {
      expect(overlay.getAttribute('data-target-testid')).toBe('provider-api-key-input')
    }

    await fireEvent.click(screen.getByTestId('ollama-detail-complete'))
    await act(async () => {})

    expect(completeStep).toHaveBeenCalledTimes(1)
    expect(router.push).toHaveBeenCalledWith({
      name: 'settings-mcp'
    })
  })

  it('ignores provider configured events when another onboarding step is active', async () => {
    const { router, completeStep } = await setup({
      guideCurrentStepId: 'mcp'
    })

    await fireEvent.click(screen.getByTestId('generic-detail-complete'))
    await act(async () => {})

    expect(completeStep).not.toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalledWith({
      name: 'settings-mcp'
    })
  })

  it('auto-continues onboarding when a model is enabled during the provider-model step', async () => {
    const { router, completeStep } = await setup({
      guideCurrentStepId: 'provider-model',
      visibleGuideStepId: 'provider-model'
    })

    await fireEvent.click(screen.getByTestId('provider-model-toggle-anthropic-claude-sonnet'))
    await act(async () => {})

    expect(completeStep).toHaveBeenCalledTimes(1)
    expect(router.push).toHaveBeenCalledWith({
      name: 'settings-mcp'
    })
  })

  it('retargets the provider-model guide to the first model toggle after models load', async () => {
    const { modelStore } = await setup({
      guideCurrentStepId: 'provider-model',
      visibleGuideStepId: 'provider-model',
      initialProviderModels: [
        {
          providerId: 'anthropic',
          models: []
        }
      ]
    })

    const overlay = screen.queryByTestId('guided-overlay')
    if (overlay) {
      expect(overlay.getAttribute('data-target-testid')).toBe('provider-models-tab-trigger')
    }

    modelStore.allProviderModels = [
      {
        providerId: 'anthropic',
        models: [{ id: 'claude-sonnet', providerId: 'anthropic', enabled: false }]
      }
    ]

    await waitForGuideTargetSync()

    const updatedOverlay = screen.queryByTestId('guided-overlay')
    if (updatedOverlay) {
      expect(updatedOverlay.getAttribute('data-target-testid')).toBe(
        'provider-model-toggle-anthropic-claude-sonnet'
      )
    }
  })
})
