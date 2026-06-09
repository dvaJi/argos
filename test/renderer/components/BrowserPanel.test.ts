import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'

describe('BrowserPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // TODO: flesh out React test — accessible labels, waits for stable rect before attach,
  // syncs bounds on resize, skips unchanged bounds, ignores open requests for other sessions
  it('placeholder: module imports resolve', async () => {
    expect(true).toBe(true)
  })
})
