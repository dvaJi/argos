import React from 'react'
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer'

interface MarkdownArtifactProps {
  block: { artifact: { type: string; title: string }; content: string }
  className?: string
}

export function MarkdownArtifact({ block, className }: MarkdownArtifactProps) {
  return (
    <div
      className={`markdown-content-wrapper relative w-full px-4 pb-8 artifact-dialog-content ${className ?? ''}`}
    >
      <MarkdownRenderer content={block.content || ''} linkContext={{ source: 'artifact' }} />
      <style>{`
        .markdown-content-wrapper {
          line-height: 1.75rem;
          font-family: var(--dc-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif);
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
      `}</style>
    </div>
  )
}
