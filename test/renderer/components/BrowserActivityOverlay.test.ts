import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import type { YoBrowserActivityPayload } from '@shared/types/browser'

describe('BrowserActivityOverlay', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  // TODO: flesh out React test — shows halo for browser activity, keeps halo alive until
  // safety ttl, refreshes ttl on repeated id, keeps halo until all pending finish
  it('placeholder: module imports resolve', async () => {
    expect(true).toBe(true)
  })
})
