import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import MermaidArtifact from '@/components/artifacts/MermaidArtifact'

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    run: vi.fn().mockResolvedValue(undefined)
  }
}))

describe('MermaidArtifact', () => {
  describe('sanitizeMermaidContent', () => {
    it('should render normal mermaid content', async () => {
      render(
        <MermaidArtifact
          block={{
            content: 'graph TD\nA-->B',
            artifact: { type: 'application/vnd.ant.mermaid', title: 'Test Diagram' }
          }}
          isPreview
        />
      )

      await new Promise((resolve) => setTimeout(resolve, 100))

      const mermaidRef = screen.getByTestId('mermaid-artifact-preview')
      expect(mermaidRef).toBeTruthy()

      expect(mermaidRef.textContent).toBe('graph TD\nA-->B')
    })

    it('should filter dangerous img tag with onerror', async () => {
      const maliciousContent = 'graph TD\nA["<img src=x onerror=alert(1)>"]'

      render(
        <MermaidArtifact
          block={{
            content: maliciousContent,
            artifact: { type: 'application/vnd.ant.mermaid', title: 'Malicious Diagram' }
          }}
          isPreview
        />
      )

      await new Promise((resolve) => setTimeout(resolve, 100))

      const mermaidRef = screen.getByTestId('mermaid-artifact-preview')
      expect(mermaidRef).toBeTruthy()

      expect(mermaidRef.innerHTML).not.toContain('<img')
      expect(mermaidRef.innerHTML).not.toContain('onerror')
      expect(mermaidRef.innerHTML).toContain('graph TD')
      expect(mermaidRef.innerHTML).toContain('A[')
    })

    it('should filter script tags', async () => {
      const maliciousContent = 'graph TD\nA<script>alert(1)</script>'

      render(
        <MermaidArtifact
          block={{
            content: maliciousContent,
            artifact: { type: 'application/vnd.ant.mermaid', title: 'Malicious Diagram' }
          }}
          isPreview
        />
      )

      await new Promise((resolve) => setTimeout(resolve, 100))

      const mermaidRef = screen.getByTestId('mermaid-artifact-preview')
      expect(mermaidRef.innerHTML).not.toContain('<script>')
      expect(mermaidRef.innerHTML).not.toContain('alert(1)')
      expect(mermaidRef.innerHTML).toContain('graph TD')
    })

    it('should filter event handlers', async () => {
      const maliciousContent = 'graph TD\nA["<div onclick=alert(1)>Click me</div>"]'

      render(
        <MermaidArtifact
          block={{
            content: maliciousContent,
            artifact: { type: 'application/vnd.ant.mermaid', title: 'Malicious Diagram' }
          }}
          isPreview
        />
      )

      await new Promise((resolve) => setTimeout(resolve, 100))

      const mermaidRef = screen.getByTestId('mermaid-artifact-preview')
      expect(mermaidRef.innerHTML).not.toContain('onclick')
      expect(mermaidRef.innerHTML).not.toContain('alert(1)')
    })

    it('should filter dangerous protocols', async () => {
      const maliciousContent = 'graph TD\nA["javascript:alert(1)"]'

      render(
        <MermaidArtifact
          block={{
            content: maliciousContent,
            artifact: { type: 'application/vnd.ant.mermaid', title: 'Malicious Diagram' }
          }}
          isPreview
        />
      )

      await new Promise((resolve) => setTimeout(resolve, 100))

      const mermaidRef = screen.getByTestId('mermaid-artifact-preview')
      expect(mermaidRef.innerHTML).not.toContain('javascript:')
      expect(mermaidRef.innerHTML).toContain('graph TD')
    })

    it('should handle the exact PoC from the vulnerability report', async () => {
      const pocContent =
        'graph TD\nA["<img src=x onerror=\'(async()=>{ const ipc=window.electron.ipcRenderer; await ipc.invoke(`presenter:call`, `mcpPresenter`, `addMcpServer`, `test`, {command:`calc.exe`,args:[],type:`stdio`,enabled:true,name:`test`}); await ipc.invoke(`presenter:call`, `mcpPresenter`, `startServer`, `test`);})()\'/>"]'

      render(
        <MermaidArtifact
          block={{
            content: pocContent,
            artifact: { type: 'application/vnd.ant.mermaid', title: 'PoC Diagram' }
          }}
          isPreview
        />
      )

      await new Promise((resolve) => setTimeout(resolve, 100))

      const mermaidRef = screen.getByTestId('mermaid-artifact-preview')
      expect(mermaidRef.innerHTML).not.toContain('<img')
      expect(mermaidRef.innerHTML).not.toContain('onerror')
      expect(mermaidRef.innerHTML).not.toContain('ipc.invoke')
      expect(mermaidRef.innerHTML).not.toContain('calc.exe')
      expect(mermaidRef.innerHTML).toContain('graph TD')
      expect(mermaidRef.innerHTML).toContain('A[')
    })
  })

  it('does not render preview when isPreview is false', () => {
    const { container } = render(
      <MermaidArtifact
        block={{
          content: 'graph TD\nA-->B',
          artifact: { type: 'application/vnd.ant.mermaid', title: 'Test Diagram' }
        }}
        isPreview={false}
      />
    )

    const pre = container.querySelector('pre')
    expect(pre).toBeTruthy()
    expect(pre?.textContent).toContain('graph TD')
    expect(pre?.textContent).toContain('A-->B')
  })

  it('uses full-height preview classes without viewport-based caps', () => {
    const { container } = render(
      <MermaidArtifact
        block={{
          content: 'graph TD\nA-->B',
          artifact: { type: 'application/vnd.ant.mermaid', title: 'Test Diagram' }
        }}
        isPreview
      />
    )

    const root = screen.getByTestId('mermaid-artifact-root')
    expect(root.className).toEqual(
      expect.arrayContaining(['flex', 'h-full', 'min-h-0', 'w-full', 'flex-col', 'overflow-hidden'])
    )

    const preview = screen.getByTestId('mermaid-artifact-preview')
    expect(preview.className).toEqual(
      expect.arrayContaining(['flex', 'h-full', 'min-h-0', 'w-full', 'flex-1', 'overflow-auto'])
    )
    expect(preview.getAttribute('class')).not.toContain('max-h-[calc(100vh-120px)]')
  })
})
