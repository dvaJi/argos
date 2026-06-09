import React, { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'

interface MermaidArtifactProps {
  block: { artifact: { type: string; title: string }; content: string }
  isPreview: boolean
  className?: string
}

const sanitizeMermaidContent = (content: string): string => {
  if (!content || typeof content !== 'string') return ''
  let sanitized = content
  const dangerousTags = [
    /<script[^>]*>[\s\S]*?<\/script>/gi,
    /<iframe[^>]*>[\s\S]*?<\/iframe>/gi,
    /<object[^>]*>[\s\S]*?<\/object>/gi,
    /<embed\b(?:"[^"]*"|'[^']*'|[^'">])*?>/gi,
    /<form[^>]*>[\s\S]*?<\/form>/gi,
    /<link\b(?:"[^"]*"|'[^']*'|[^'">])*?>/gi,
    /<style[^>]*>[\s\S]*?<\/style>/gi,
    /<meta\b(?:"[^"]*"|'[^']*'|[^'">])*?>/gi,
    /<img\b(?:"[^"]*"|'[^']*'|[^'">])*?>/gi
  ]
  for (const pattern of dangerousTags) sanitized = sanitized.replace(pattern, '')
  sanitized = sanitized.replace(/on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  for (const p of [/javascript\s*:/gi, /vbscript\s*:/gi, /data\s*:\s*text\/html/gi]) {
    sanitized = sanitized.replace(p, '')
  }
  return sanitized
}

type MermaidTheme = 'default' | 'base' | 'dark' | 'forest' | 'neutral' | 'null'

const getTheme = (): MermaidTheme =>
  document.documentElement.classList.contains('dark') ? 'dark' : 'default'

export function MermaidArtifact({ block, isPreview, className }: MermaidArtifactProps) {
  const mermaidRef = useRef<HTMLDivElement>(null)
  const themeObserverRef = useRef<MutationObserver | null>(null)

  const initMermaid = (theme: MermaidTheme) => {
    mermaid.initialize({
      startOnLoad: false,
      theme,
      securityLevel: 'strict',
      fontFamily: 'inherit'
    })
  }

  const renderDiagram = async () => {
    if (!mermaidRef.current || !block.content) return
    try {
      const sanitizedContent = sanitizeMermaidContent(block.content)
      mermaidRef.current.textContent = sanitizedContent
      await mermaid.run({ nodes: [mermaidRef.current] })
    } catch (error) {
      console.error('Failed to render mermaid diagram:', error)
      if (mermaidRef.current) {
        const msg = error instanceof Error ? error.message : 'Unknown error'
        mermaidRef.current.textContent = ''
        const errorDiv = document.createElement('div')
        errorDiv.classList.add('text-destructive', 'p-4', 'm-0')
        errorDiv.textContent = `Render error: ${msg}`
        mermaidRef.current.appendChild(errorDiv)
      }
    }
  }

  useEffect(() => {
    initMermaid(getTheme())

    const applyThemeChange = () => {
      initMermaid(getTheme())
      if (isPreview) renderDiagram()
    }

    themeObserverRef.current = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          applyThemeChange()
          break
        }
      }
    })
    themeObserverRef.current.observe(document.documentElement, { attributes: true })

    if (isPreview) renderDiagram()

    return () => {
      themeObserverRef.current?.disconnect()
      themeObserverRef.current = null
    }
  }, [])

  useEffect(() => {
    if (isPreview) renderDiagram()
  }, [block.content, isPreview])

  if (isPreview) {
    return (
      <div
        className={`flex h-full min-h-0 w-full flex-col overflow-hidden ${className ?? ''}`}
        data-testid="mermaid-artifact-root"
      >
        <div
          ref={mermaidRef}
          className="flex h-full min-h-0 w-full flex-1 items-center justify-center overflow-auto p-4 [&_svg]:max-h-full [&_svg]:max-w-full [&_svg]:h-auto [&_svg]:w-auto"
          data-testid="mermaid-artifact-preview"
        />
      </div>
    )
  }

  return (
    <div className={`h-full min-h-0 p-4 ${className ?? ''}`}>
      <pre className="m-0 h-full min-h-0 overflow-auto rounded-lg bg-muted p-4">
        <code className="font-mono text-sm leading-6 h-full block">{block.content}</code>
      </pre>
    </div>
  )
}
