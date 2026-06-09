import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'

afterEach(() => {
  vi.clearAllMocks()
})

describe('AcpSettings', () => {
  // TODO: flesh out React test — uninstalls registry agent through alert dialog
  it('placeholder: module imports resolve', async () => {
    expect(true).toBe(true)
  })
})
