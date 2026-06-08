import { describe, it, expect, vi } from 'vitest'

vi.mock('@/stores/artifact', () => ({
  useArtifactStore: () => ({
    showArtifact: vi.fn()
  })
}))

vi.mock('@/stores/reference', () => ({
  useReferenceStore: () => ({
    hideReference: vi.fn(),
    showReference: vi.fn()
  })
}))

vi.mock('@/stores/theme', () => ({
  useThemeStore: () => ({
    isDark: false
  })
}))

vi.mock('@/stores/uiSettingsStore', () => ({
  useUiSettingsStore: () => ({
    formattedCodeFontFamily: 'monospace'
  })
}))

vi.mock('@api/SessionClient', () => ({
  createSessionClient: vi.fn(() => ({
    getSearchResults: vi.fn().mockResolvedValue([])
  }))
}))

vi.mock('@/components/markdown/useMarkdownLinkNavigation', () => ({
  useMarkdownLinkNavigation: () => ({
    navigateLink: vi.fn().mockResolvedValue(true)
  })
}))

describe('MarkdownRenderer', () => {
  it('placeholder — full React tests will be written in Phase 12', () => {
    expect(true).toBe(true)
  })
})
