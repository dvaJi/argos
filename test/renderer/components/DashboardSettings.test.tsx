import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import type { UsageDashboardData } from '@shared/types/agent-interface'

function buildDashboard(overrides: Partial<UsageDashboardData> = {}): UsageDashboardData {
  return {
    recordingStartedAt: new Date(2026, 2, 1, 12, 0, 0).getTime(),
    backfillStatus: {
      status: 'completed',
      startedAt: new Date(2026, 2, 1, 12, 0, 0).getTime(),
      finishedAt: new Date(2026, 2, 1, 12, 0, 5).getTime(),
      error: null,
      updatedAt: new Date(2026, 2, 1, 12, 0, 5).getTime()
    },
    summary: {
      messageCount: 2,
      sessionCount: 3,
      inputTokens: 800,
      outputTokens: 400,
      totalTokens: 1200,
      cachedInputTokens: 200,
      cacheHitRate: 0.25,
      estimatedCostUsd: 0.0123,
      mostActiveDay: {
        date: '2026-03-09',
        messageCount: 2
      }
    },
    calendar: Array.from({ length: 28 }, (_, index) => ({
      date: `2026-03-${`${index + 1}`.padStart(2, '0')}`,
      messageCount: index % 4 === 0 ? 1 : 0,
      inputTokens: index % 4 === 0 ? 40 : 0,
      outputTokens: index % 4 === 0 ? 20 : 0,
      totalTokens: index % 4 === 0 ? 60 : 0,
      cachedInputTokens: index % 8 === 0 ? 10 : 0,
      estimatedCostUsd: index % 4 === 0 ? 0.0006 : null,
      level: index % 4 === 0 ? 3 : 0
    })),
    providerBreakdown: [
      {
        id: 'openai',
        label: 'OpenAI',
        messageCount: 2,
        inputTokens: 800,
        outputTokens: 400,
        totalTokens: 1200,
        cachedInputTokens: 200,
        estimatedCostUsd: 0.0123
      }
    ],
    modelBreakdown: [
      {
        id: 'gpt-4o',
        label: 'GPT-4o',
        messageCount: 2,
        inputTokens: 800,
        outputTokens: 400,
        totalTokens: 1200,
        cachedInputTokens: 200,
        estimatedCostUsd: 0.0123
      }
    ],
    rtk: {
      scope: 'deepchat',
      enabled: true,
      effectiveEnabled: true,
      available: true,
      health: 'healthy',
      checkedAt: new Date(2026, 2, 1, 12, 0, 5).getTime(),
      source: 'bundled',
      failureStage: null,
      failureMessage: null,
      summary: {
        totalCommands: 12,
        totalInputTokens: 5000,
        totalOutputTokens: 1200,
        totalSavedTokens: 3800,
        avgSavingsPct: 76,
        totalTimeMs: 2400,
        avgTimeMs: 200
      },
      daily: []
    },
    ...overrides
  }
}

async function setup(
  data: UsageDashboardData,
  options: {
    getUsageDashboard?: ReturnType<typeof vi.fn>
    retryRtkHealthCheck?: ReturnType<typeof vi.fn>
  } = {}
) {
  vi.resetModules()
  const getUsageDashboard = options.getUsageDashboard ?? vi.fn().mockResolvedValue(data)
  const retryRtkHealthCheck = options.retryRtkHealthCheck ?? vi.fn().mockResolvedValue(undefined)

  vi.doMock('@api/legacy/presenters', () => ({
    useLegacyPresenter: () => ({
      getUsageDashboard,
      retryRtkHealthCheck
    })
  }))

  const DashboardSettings = (
    await import('../../../src/renderer/settings/components/DashboardSettings')
  ).default

  const result = render(<DashboardSettings />)

  await act(async () => {})

  return {
    ...result,
    getUsageDashboard,
    retryRtkHealthCheck
  }
}

describe('DashboardSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 17, 12, 0, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the empty state when no stats are available', async () => {
    const { container } = await setup(
      buildDashboard({
        summary: {
          messageCount: 0,
          sessionCount: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          cachedInputTokens: 0,
          cacheHitRate: 0,
          estimatedCostUsd: null,
          mostActiveDay: {
            date: null,
            messageCount: 0
          }
        },
        providerBreakdown: [],
        modelBreakdown: []
      })
    )

    expect(screen.queryByTestId('dashboard-empty')).toBeTruthy()
  })

  it('renders the backfill banner while historical stats are initializing', async () => {
    await setup(
      buildDashboard({
        backfillStatus: {
          status: 'running',
          startedAt: new Date(2026, 2, 1, 12, 0, 0).getTime(),
          finishedAt: null,
          error: null,
          updatedAt: new Date(2026, 2, 1, 12, 0, 5).getTime()
        }
      })
    )

    expect(screen.queryByTestId('dashboard-backfill-banner')).toBeTruthy()
  })

  it('renders summary cards and breakdown rows when stats exist', async () => {
    const { container, getUsageDashboard } = await setup(buildDashboard())
    const summaryCards = container.querySelectorAll('[data-testid^="summary-card-"]')
    const header = screen.getByTestId('dashboard-header')
    const calendarHeatmap = screen.getByTestId('dashboard-calendar-heatmap')
    const calendarWeeks = screen.getByTestId('dashboard-calendar-weeks')
    const tokenUsageList = screen.getByTestId('token-usage-list')

    expect(getUsageDashboard).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('OpenAI')
    expect(container.textContent).toContain('GPT-4o')
    expect(container.textContent).toContain('1.2k')
    expect(container.textContent).toContain('Input')
    expect(container.textContent).toContain('Output')
    expect(container.textContent).toContain('66.7%')
    expect(container.textContent).toContain('33.3%')
    expect(container.textContent).toContain('Cached')
    expect(container.textContent).toContain('25%')
    expect(container.textContent).toContain('17 days')
    expect(container.textContent).toContain('You and DeepChat have spent 17 days together.')
    expect(container.textContent).toContain('You have shared 3 sessions together.')
    expect(container.textContent).toContain('You have exchanged 2 messages.')
    expect(container.textContent).toContain(
      'Mar 9, 2026 was your most active day, with 2 messages.'
    )
    expect(container.textContent).not.toContain('settings.dashboard.summary.cacheHitRate')
    expect(summaryCards).toHaveLength(2)
    expect(header.className).toContain('flex-col')
    expect(header.className).toContain('sm:flex-row')
    expect(screen.queryByTestId('summary-card-tokenUsage')).toBeTruthy()
    expect(screen.queryByTestId('summary-card-nostalgia')).toBeTruthy()
    expect(screen.queryByTestId('token-usage-trend-chart')).toBeTruthy()
    expect(container.querySelectorAll('[data-testid="chart-crosshair"]').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('[data-testid="chart-tooltip"]').length).toBeGreaterThan(0)
    expect(screen.queryByTestId('token-usage-input-dot')).toBeTruthy()
    expect(screen.getByTestId('token-usage-input-dot').getAttribute('style')).toContain(
      'var(--primary-600)'
    )
    expect(screen.queryByTestId('token-usage-output-dot')).toBeTruthy()
    expect(screen.queryByTestId('token-usage-cached-dot')).toBeTruthy()
    expect(screen.queryByTestId('token-usage-cost-dot')).toBeTruthy()
    expect(screen.queryByTestId('token-usage-total-row')).toBeTruthy()
    expect(screen.getByTestId('token-usage-cost-row').textContent).toContain(
      'Trend over the last 30 days'
    )
    expect(tokenUsageList.textContent).not.toContain('Uncached')
    expect(screen.queryByTestId('cached-tokens-bar')).toBeNull()
    expect(screen.queryByTestId('provider-breakdown-chart')).toBeTruthy()
    expect(screen.queryByTestId('model-breakdown-chart')).toBeTruthy()
    expect(screen.queryByTestId('provider-breakdown-scroll')).toBeTruthy()
    expect(screen.queryByTestId('model-breakdown-scroll')).toBeTruthy()
    expect(container.querySelector('[title="1,200"]')).toBeTruthy()
    expect(container.querySelectorAll('[data-testid="calendar-cell"]').length).toBeGreaterThan(0)
    expect(calendarHeatmap.className).toContain('calendar-heatmap')
    expect(calendarWeeks.getAttribute('style')).toContain('repeat(4, minmax(0, 1fr))')
    expect(tokenUsageList.className).toContain('dashboard-token-usage-list')
    const nostalgiaCard = screen.getByTestId('summary-card-nostalgia')
    expect(nostalgiaCard.innerHTML).toContain('whitespace-normal')
    expect(nostalgiaCard.innerHTML).toContain('md:col-span-2')
    expect(nostalgiaCard.innerHTML).toContain('lg:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]')
    expect(screen.getByTestId('nostalgia-details').innerHTML).toContain('space-y-2')
    expect(screen.getByTestId('nostalgia-rotating-value').textContent).toBe('17 days')

    await vi.advanceTimersByTimeAsync(4000)
    expect(screen.getByTestId('nostalgia-rotating-value').textContent).toBe('3 sessions')

    await vi.advanceTimersByTimeAsync(4000)
    expect(screen.getByTestId('nostalgia-rotating-value').textContent).toBe('2 messages')
  })

  it('renders RTK savings summary when RTK is healthy', async () => {
    const { container } = await setup(buildDashboard())

    expect(screen.queryByTestId('rtk-card')).toBeTruthy()
    expect(screen.getByTestId('rtk-card').innerHTML).toContain('dashboard-rtk-summary-grid')
    expect(screen.getByTestId('rtk-status-badge').textContent).toBe('Bundled')
    expect(screen.getByTestId('rtk-summary-saved').textContent).toContain('3.8k')
    expect(screen.getByTestId('rtk-summary-commands').textContent).toContain('12')
    expect(screen.getByTestId('rtk-summary-rate').textContent).toContain('76%')
    expect(screen.queryByTestId('rtk-status-copy')).toBeNull()
  })

  it('shows RTK retry action when health check fails', async () => {
    const retryRtkHealthCheck = vi.fn().mockResolvedValue(undefined)
    const { getUsageDashboard } = await setup(
      buildDashboard({
        rtk: {
          ...buildDashboard().rtk,
          health: 'unhealthy',
          effectiveEnabled: false,
          failureMessage: 'rtk --version failed'
        }
      }),
      { retryRtkHealthCheck }
    )

    await fireEvent.click(screen.getByTestId('rtk-retry-button'))
    await act(async () => {})

    expect(screen.getByTestId('rtk-status-copy').textContent).toContain('rtk --version failed')
    expect(retryRtkHealthCheck).toHaveBeenCalledTimes(1)
    expect(getUsageDashboard).toHaveBeenCalledTimes(2)
  })

  it('renders an empty trend summary with 0% ratios when total tokens are zero', async () => {
    await setup(
      buildDashboard({
        summary: {
          messageCount: 1,
          sessionCount: 1,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          cachedInputTokens: 0,
          cacheHitRate: 0,
          estimatedCostUsd: null,
          mostActiveDay: {
            date: null,
            messageCount: 0
          }
        }
      })
    )

    expect(screen.getByTestId('summary-card-tokenUsage').textContent).toContain('0')
    expect(screen.queryByTestId('token-usage-trend-chart')).toBeTruthy()
    expect(screen.getByTestId('total-tokens-input-ratio').textContent).toBe('0%')
    expect(screen.getByTestId('total-tokens-output-ratio').textContent).toBe('0%')
    expect(screen.getByTestId('cached-tokens-cached-ratio').textContent).toBe('0%')
  })

  it('renders cached token ratio without uncached rows when input tokens are zero', async () => {
    await setup(
      buildDashboard({
        summary: {
          messageCount: 1,
          sessionCount: 1,
          inputTokens: 0,
          outputTokens: 400,
          totalTokens: 400,
          cachedInputTokens: 0,
          cacheHitRate: 0,
          estimatedCostUsd: 0.0123,
          mostActiveDay: {
            date: '2026-03-10',
            messageCount: 1
          }
        }
      })
    )

    expect(screen.queryByTestId('cached-tokens-bar')).toBeNull()
    expect(screen.getByTestId('cached-tokens-cached-ratio').textContent).toBe('0%')
    expect(screen.queryByTestId('cached-tokens-uncached-ratio')).toBeNull()
  })

  it('keeps the merged token usage chart when the last 30 days have no cost data', async () => {
    await setup(
      buildDashboard({
        calendar: Array.from({ length: 28 }, (_, index) => ({
          date: `2026-03-${`${index + 1}`.padStart(2, '0')}`,
          messageCount: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          cachedInputTokens: 0,
          estimatedCostUsd: null,
          level: 0 as const
        }))
      })
    )

    expect(screen.queryByTestId('token-usage-trend-chart')).toBeTruthy()
    expect(screen.getByTestId('token-usage-cost-row').textContent).toContain(
      'Trend over the last 30 days'
    )
  })

  it('renders N/A for days together when the first usage record is unavailable', async () => {
    await setup(
      buildDashboard({
        recordingStartedAt: null
      })
    )

    const summaryCard = screen.getByTestId('summary-card-nostalgia')

    expect(summaryCard).toBeTruthy()
    expect(summaryCard.textContent).toContain('N/A')
    expect(summaryCard.textContent).toContain('You have shared 3 sessions together.')
    expect(screen.getByTestId('nostalgia-rotating-value').textContent).toBe('3 sessions')
  })

  it('renders N/A for the most active day when that summary is unavailable', async () => {
    await setup(
      buildDashboard({
        summary: {
          messageCount: 2,
          sessionCount: 3,
          inputTokens: 800,
          outputTokens: 400,
          totalTokens: 1200,
          cachedInputTokens: 200,
          cacheHitRate: 0.25,
          estimatedCostUsd: 0.0123,
          mostActiveDay: {
            date: null,
            messageCount: 0
          }
        }
      })
    )

    expect(screen.getByTestId('nostalgia-detail-most-active-day').textContent).toContain('N/A')
  })

  it('cleans up scheduled timers when the component unmounts', async () => {
    const { unmount } = await setup(buildDashboard())

    expect(vi.getTimerCount()).toBeGreaterThan(0)

    unmount()

    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not reschedule timers when an async dashboard load resolves after unmount', async () => {
    let resolveDashboard: ((value: UsageDashboardData) => void) | null = null
    const getUsageDashboard = vi.fn().mockImplementation(
      () =>
        new Promise<UsageDashboardData>((resolve) => {
          resolveDashboard = resolve
        })
    )

    const { unmount } = await setup(buildDashboard(), { getUsageDashboard })

    expect(getUsageDashboard).toHaveBeenCalledTimes(1)

    unmount()
    resolveDashboard?.(buildDashboard())
    await act(async () => {})

    expect(vi.getTimerCount()).toBe(0)
  })
})
