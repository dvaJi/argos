import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

vi.mock('@iconify/react', () => ({
  Icon: ({ icon }: { icon: string }) => <i data-icon={icon} />
}))

const setup = async () => {
  vi.resetModules()

  const resultItem = {
    id: 'session:1',
    kind: 'session' as const,
    icon: 'lucide:message-square',
    title: 'DeepChat Session',
    subtitle: '/workspace/demo',
    score: 100,
    sessionId: 'session-1'
  }

  const spotlightStore = {
    open: true,
    activationKey: 1,
    query: '',
    results: [resultItem],
    activeIndex: 0,
    loading: false,
    closeSpotlight: vi.fn(),
    setQuery: vi.fn(),
    setActiveItem: vi.fn(),
    moveActiveItem: vi.fn(),
    executeItem: vi.fn(),
    executeActiveItem: vi.fn()
  }

  vi.doMock('@/stores/ui/spotlight', () => ({
    useSpotlightStore: () => spotlightStore
  }))

  const SpotlightOverlay = (await import('@/components/spotlight/SpotlightOverlay')).default

  const result = render(<SpotlightOverlay />)

  return {
    ...result,
    spotlightStore,
    resultItem
  }
}

describe('SpotlightOverlay', () => {
  it('marks the overlay as a no-drag region', async () => {
    const { container } = await setup()

    expect(container.firstElementChild?.classList.contains('window-no-drag-region')).toBe(true)
    expect(container.querySelector('.window-no-drag-region')).toBeTruthy()
  })

  it('forwards input changes and immediate mouse selections to the spotlight store', async () => {
    const { container, spotlightStore, resultItem } = await setup()

    const input = container.querySelector('input')!
    await act(async () => {
      fireEvent.change(input, { target: { value: 'deep' } })
    })
    expect(spotlightStore.setQuery).toHaveBeenCalledWith('deep')

    const button = container.querySelector('button')!
    await act(async () => {
      fireEvent.mouseDown(button, { button: 0 })
    })
    expect(spotlightStore.executeItem).toHaveBeenCalledWith(resultItem)
  })

  it('refocuses the search input when spotlight is activated again', async () => {
    const { container, spotlightStore } = await setup()

    const input = container.querySelector('input') as HTMLInputElement
    input.blur()

    spotlightStore.activationKey += 1
    await act(async () => {})
    await act(async () => {})

    expect(document.activeElement).toBe(input)
  })
})
