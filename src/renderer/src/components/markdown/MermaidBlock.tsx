import { useEffect, useRef, useState } from 'react'

interface MermaidBlockProps {
  node: {
    type?: string
    language?: string
    code: string
    raw?: string
  }
  isStrict?: boolean
  className?: string
}

export function MermaidBlock({ node, className }: MermaidBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    import('mermaid').then((mermaid) => {
      if (cancelled) return

      mermaid.default.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'loose'
      })

      const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`
      mermaid.default
        .render(id, node.code)
        .then(({ svg: renderedSvg }) => {
          if (!cancelled) {
            setSvg(renderedSvg)
            setError(null)
          }
        })
        .catch((err: Error) => {
          if (!cancelled) {
            setError(err.message)
            setSvg(null)
          }
        })
    })

    return () => {
      cancelled = true
    }
  }, [node.code])

  if (error) {
    return (
      <pre
        className={`text-xs p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg overflow-auto ${className ?? ''}`}
      >
        {node.code}
      </pre>
    )
  }

  if (!svg) {
    return (
      <div
        className={`flex items-center justify-center p-4 text-muted-foreground text-xs ${className ?? ''}`}
      >
        Loading diagram...
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={`overflow-auto ${className ?? ''}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
