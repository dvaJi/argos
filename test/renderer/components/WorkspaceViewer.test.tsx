import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

describe('WorkspaceViewer', () => {
  const setup = async (options?: {
    sessionState?: {
      selectedArtifactContext: {
        threadId: string
        messageId: string
        artifactId: string
      } | null
      selectedFilePath: string | null
      selectedDiffPath: string | null
      viewMode: 'preview' | 'code'
      sections: {
        files: boolean
        git: boolean
        artifacts: boolean
      }
    }
    props?: Record<string, unknown>
  }) => {
    vi.resetModules()

    const sessionState =
      options?.sessionState ??
      ({
        selectedArtifactContext: {
          threadId: 'thread-1',
          messageId: 'message-1',
          artifactId: 'artifact-1'
        },
        selectedFilePath: null,
        selectedDiffPath: null,
        viewMode: 'preview',
        sections: {
          files: true,
          git: false,
          artifacts: true
        }
      } as const)

    const sidepanelStore = {
      getSessionState: vi.fn(() => sessionState),
      setViewMode: vi.fn()
    }

    const openFileMock = vi.fn().mockResolvedValue(undefined)

    vi.doMock('react-i18next', () => ({
      useTranslation: () => ({
        t: (key: string) => key
      })
    }))

    vi.doMock('@/stores/ui/sidepanel', () => ({
      useSidepanelStore: () => sidepanelStore
    }))

    vi.doMock('@iconify/react', () => ({
      Icon: () => <span data-testid="icon" />
    }))

    vi.doMock('@api/WorkspaceClient', () => ({
      createWorkspaceClient: () => ({
        openFile: openFileMock
      })
    }))

    vi.doMock('@/components/sidepanel/viewer/WorkspaceCodePane', () => ({
      default: ({ source }: { source: any }) => <div data-testid="code-pane">{source.type}</div>
    }))

    vi.doMock('@/components/sidepanel/viewer/WorkspacePreviewPane', () => ({
      default: ({ sessionId, previewKind }: { sessionId?: string; previewKind: string }) => (
        <div data-testid="preview-pane" data-session-id={sessionId}>
          {previewKind}
        </div>
      )
    }))

    vi.doMock('@/components/sidepanel/viewer/WorkspaceInfoPane', () => ({
      default: () => <div data-testid="info-pane">info</div>
    }))

    const WorkspaceViewer = (await import('@/components/sidepanel/WorkspaceViewer')).default
    const result = render(
      <WorkspaceViewer
        sessionId="thread-1"
        artifact={{
          id: 'artifact-1',
          type: 'application/octet-stream',
          title: 'Raw artifact',
          content: 'fallback content',
          status: 'loaded'
        }}
        filePreview={null}
        gitDiff={null}
        loadingFilePreview={false}
        loadingGitDiff={false}
        isFullscreen={false}
        {...options?.props}
      />
    )

    return { ...result, sidepanelStore, openFileMock }
  }

  it('shows a maximize button and emits toggle-fullscreen', async () => {
    const onToggleFullscreen = vi.fn()
    const { container } = await setup({
      props: {
        onToggleFullscreen
      }
    })

    const fullscreenButton = screen.getByTestId('workspace-viewer-fullscreen-toggle')
    expect(fullscreenButton.getAttribute('title')).toBe('common.maximize')

    await act(async () => {
      fireEvent.click(fullscreenButton)
    })
    expect(onToggleFullscreen).toHaveBeenCalledTimes(1)
  })

  it('shows restore label while fullscreen is active', async () => {
    await setup({
      props: {
        isFullscreen: true
      }
    })

    expect(screen.getByTestId('workspace-viewer-fullscreen-toggle').getAttribute('title')).toBe(
      'common.restore'
    )
  })

  it('shows raw artifact preview through preview pane fallback', async () => {
    const { container } = await setup()

    const body = screen.getByTestId('workspace-viewer-body')
    expect(body.className.split(' ')).toEqual(
      expect.arrayContaining(['min-h-0', 'flex-1', 'overflow-hidden'])
    )
    const previewPane = screen.getByTestId('preview-pane')
    expect(previewPane.className.split(' ')).toEqual(
      expect.arrayContaining(['h-full', 'min-h-0', 'w-full'])
    )
    expect(previewPane.textContent).toContain('raw')
    expect(container.textContent).toContain('artifacts.preview')
    expect(container.textContent).toContain('artifacts.code')
  })

  it('renders code pane only for text files', async () => {
    const { container } = await setup({
      sessionState: {
        selectedArtifactContext: null,
        selectedFilePath: 'C:/repo/src/app.ts',
        selectedDiffPath: null,
        viewMode: 'preview',
        sections: {
          files: true,
          git: false,
          artifacts: true
        }
      },
      props: {
        artifact: null,
        filePreview: {
          path: 'C:/repo/src/app.ts',
          relativePath: 'src/app.ts',
          name: 'app.ts',
          mimeType: 'application/typescript',
          kind: 'text',
          content: 'export const app = 1',
          language: 'ts',
          metadata: {
            fileName: 'app.ts',
            fileSize: 18,
            fileCreated: new Date('2024-01-01T00:00:00Z'),
            fileModified: new Date('2024-01-02T00:00:00Z')
          }
        }
      }
    })

    expect(screen.getByTestId('code-pane')).toBeTruthy()
    const codePane = screen.getByTestId('code-pane')
    expect(codePane.className.split(' ')).toEqual(
      expect.arrayContaining(['h-full', 'min-h-0', 'w-full'])
    )
    expect(screen.queryByTestId('preview-pane')).toBeNull()
    expect(container.textContent).not.toContain('artifacts.preview')
    expect(container.textContent).not.toContain('artifacts.code')
  })

  it('shows preview and code tabs for markdown files', async () => {
    const { sidepanelStore } = await setup({
      sessionState: {
        selectedArtifactContext: null,
        selectedFilePath: 'C:/repo/README.md',
        selectedDiffPath: null,
        viewMode: 'preview',
        sections: {
          files: true,
          git: false,
          artifacts: true
        }
      },
      props: {
        artifact: null,
        filePreview: {
          path: 'C:/repo/README.md',
          relativePath: 'README.md',
          name: 'README.md',
          mimeType: 'text/markdown',
          kind: 'markdown',
          content: '# Hello',
          language: 'markdown',
          metadata: {
            fileName: 'README.md',
            fileSize: 7,
            fileCreated: new Date('2024-01-01T00:00:00Z'),
            fileModified: new Date('2024-01-02T00:00:00Z')
          }
        }
      }
    })

    const previewPane = screen.getByTestId('preview-pane')
    expect(previewPane.textContent).toContain('markdown')
    expect(previewPane.getAttribute('data-session-id')).toBe('thread-1')

    const codeButton = screen
      .getAllByRole('button')
      .find((button) => button.textContent?.includes('artifacts.code'))
    expect(codeButton).toBeTruthy()

    await act(async () => {
      fireEvent.click(codeButton!)
    })
    expect(sidepanelStore.setViewMode).toHaveBeenCalledWith('thread-1', 'code')
  })

  it('shows preview only for pdf files', async () => {
    const { container } = await setup({
      sessionState: {
        selectedArtifactContext: null,
        selectedFilePath: 'C:/repo/manual.pdf',
        selectedDiffPath: null,
        viewMode: 'preview',
        sections: {
          files: true,
          git: false,
          artifacts: true
        }
      },
      props: {
        artifact: null,
        filePreview: {
          path: 'C:/repo/manual.pdf',
          relativePath: 'manual.pdf',
          name: 'manual.pdf',
          mimeType: 'application/pdf',
          kind: 'pdf',
          content: 'page one',
          previewUrl: 'workspace-preview://root-id/manual.pdf',
          metadata: {
            fileName: 'manual.pdf',
            fileSize: 1024,
            fileCreated: new Date('2024-01-01T00:00:00Z'),
            fileModified: new Date('2024-01-02T00:00:00Z')
          }
        }
      }
    })

    expect(screen.getByTestId('preview-pane').textContent).toContain('pdf')
    expect(screen.queryByTestId('code-pane')).toBeNull()
    expect(container.textContent).not.toContain('artifacts.preview')
    expect(container.textContent).not.toContain('artifacts.code')
  })

  it('shows preview and code tabs for svg files', async () => {
    const { sidepanelStore } = await setup({
      sessionState: {
        selectedArtifactContext: null,
        selectedFilePath: 'C:/repo/diagram.svg',
        selectedDiffPath: null,
        viewMode: 'preview',
        sections: {
          files: true,
          git: false,
          artifacts: true
        }
      },
      props: {
        artifact: null,
        filePreview: {
          path: 'C:/repo/diagram.svg',
          relativePath: 'diagram.svg',
          name: 'diagram.svg',
          mimeType: 'image/svg+xml',
          kind: 'svg',
          content: '<svg></svg>',
          previewUrl: 'workspace-preview://root-id/diagram.svg',
          language: 'svg',
          metadata: {
            fileName: 'diagram.svg',
            fileSize: 256,
            fileCreated: new Date('2024-01-01T00:00:00Z'),
            fileModified: new Date('2024-01-02T00:00:00Z')
          }
        }
      }
    })

    expect(screen.getByTestId('preview-pane').textContent).toContain('svg')

    const codeButton = screen
      .getAllByRole('button')
      .find((button) => button.textContent?.includes('artifacts.code'))
    expect(codeButton).toBeTruthy()

    await act(async () => {
      fireEvent.click(codeButton!)
    })
    expect(sidepanelStore.setViewMode).toHaveBeenCalledWith('thread-1', 'code')
  })

  it('shows info pane for unsupported files', async () => {
    const { container } = await setup({
      sessionState: {
        selectedArtifactContext: null,
        selectedFilePath: 'C:/repo/archive.zip',
        selectedDiffPath: null,
        viewMode: 'preview',
        sections: {
          files: true,
          git: false,
          artifacts: true
        }
      },
      props: {
        artifact: null,
        filePreview: {
          path: 'C:/repo/archive.zip',
          relativePath: 'archive.zip',
          name: 'archive.zip',
          mimeType: 'application/zip',
          kind: 'binary',
          content: '',
          metadata: {
            fileName: 'archive.zip',
            fileSize: 4096,
            fileCreated: new Date('2024-01-01T00:00:00Z'),
            fileModified: new Date('2024-01-02T00:00:00Z')
          }
        }
      }
    })

    expect(screen.getByTestId('info-pane')).toBeTruthy()
    const infoPane = screen.getByTestId('info-pane')
    expect(infoPane.className.split(' ')).toEqual(
      expect.arrayContaining(['h-full', 'min-h-0', 'w-full'])
    )
    expect(screen.queryByTestId('preview-pane')).toBeNull()
    expect(screen.queryByTestId('code-pane')).toBeNull()
  })
})
