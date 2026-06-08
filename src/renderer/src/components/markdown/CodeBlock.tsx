import { useCallback, useEffect, useRef, useState } from 'react'
import { useThemeStore } from '@/stores/theme'

export interface CodeBlockNodeData {
  type?: 'code_block'
  language?: string
  code: string
  raw?: string
  diff?: boolean
  originalCode?: string
  updatedCode?: string
}

interface CodeBlockProps {
  node: CodeBlockNodeData
  isDark?: boolean
  darkTheme?: string
  lightTheme?: string
  themes?: string[]
  showHeader?: boolean
  isShowPreview?: boolean
  showCopyButton?: boolean
  showExpandButton?: boolean
  showPreviewButton?: boolean
  showFontSizeButtons?: boolean
  monacoOptions?: Record<string, unknown>
  className?: string
  onPreviewCode?: (payload: {
    id: string
    artifactType: string
    artifactTitle: string
    language: string
    node: { code: string }
  }) => void
}

export function CodeBlock({
  node,
  isDark: isDarkProp,
  showHeader = true,
  showCopyButton = true,
  className
}: CodeBlockProps) {
  const themeStore = useThemeStore()
  const isDark = isDarkProp ?? themeStore.isDark
  const codeRef = useRef<HTMLElement>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (codeRef.current) {
      import('highlight.js/lib/core.js').then((hljs) => {
        if (node.language && codeRef.current) {
          import(`highlight.js/lib/languages/${node.language}.js`)
            .then((langModule) => {
              hljs.registerLanguage(node.language!, langModule.default)
              hljs.highlightElement(codeRef.current!)
            })
            .catch(() => {
              // language not supported, skip highlighting
            })
        }
      })
    }
  }, [node.language, node.code])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(node.code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [node.code])

  const lang = node.language || ''

  return (
    <div className={`rounded-lg overflow-hidden ${className ?? ''}`}>
      {showHeader && (
        <div className="flex items-center justify-between px-3 py-1.5 text-xs bg-muted border-b border-border">
          <span className="font-mono text-muted-foreground">{lang}</span>
          {showCopyButton && (
            <button
              onClick={handleCopy}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          )}
        </div>
      )}
      <pre
        className={`text-xs overflow-auto p-3 ${
          isDark ? 'bg-zinc-900 text-zinc-100' : 'bg-zinc-50 text-zinc-900'
        }`}
      >
        <code ref={codeRef} className={lang ? `language-${lang}` : ''}>
          {node.code}
        </code>
      </pre>
    </div>
  )
}
