import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '@iconify/react'
import { createDeviceClient } from '@api/DeviceClient'
import { useArtifactStore } from '@/stores/artifact'
import { useUiSettingsStore } from '@/stores/uiSettingsStore'
import { detectLanguage, useMonaco } from 'stream-monaco'
import { nanoid } from 'nanoid'

interface CodeArtifactProps {
  block: {
    artifact: { type: string; title: string; language?: string }
    content: string
  }
  isPreview: boolean
  messageId?: string
  threadId?: string
  className?: string
}

function getLanguageIcon(language: string): string {
  const icons: Record<string, string> = {
    javascript: 'logos:javascript',
    typescript: 'logos:typescript-icon',
    python: 'logos:python',
    html: 'logos:html-5',
    css: 'logos:css-3',
    json: 'codicon:json',
    markdown: 'codicon:markdown',
    java: 'logos:java',
    cpp: 'logos:c-plusplus',
    csharp: 'logos:c-sharp',
    go: 'logos:go',
    rust: 'logos:rust',
    sql: 'codicon:database',
    shell: 'codicon:terminal',
    yaml: 'codicon:settings',
    xml: 'codicon:code',
    vue: 'logos:vue',
    react: 'logos:react',
    svelte: 'logos:svelte-icon'
  }
  return icons[language] || 'codicon:file-code'
}

const sanitizeLanguage = (language?: string | null) => {
  if (!language) return ''
  const normalized = language.trim().toLowerCase()
  switch (normalized) {
    case 'md':
      return 'markdown'
    case 'plain':
    case 'text':
      return 'plaintext'
    case 'htm':
      return 'html'
    default:
      return normalized
  }
}

const DISPLAY_NAMES: Record<string, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  java: 'Java',
  cpp: 'C++',
  csharp: 'C#',
  php: 'PHP',
  ruby: 'Ruby',
  go: 'Go',
  rust: 'Rust',
  swift: 'Swift',
  kotlin: 'Kotlin',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  sql: 'SQL',
  json: 'JSON',
  yaml: 'YAML',
  markdown: 'Markdown',
  bash: 'Bash',
  shell: 'Shell',
  powershell: 'PowerShell',
  dockerfile: 'Dockerfile',
  vue: 'Vue',
  react: 'React',
  xml: 'XML',
  svg: 'SVG',
  mermaid: 'Mermaid',
  text: 'Plain Text',
  '': 'Plain Text'
}

export function CodeArtifact({
  block,
  isPreview,
  messageId,
  threadId,
  className
}: CodeArtifactProps) {
  const deviceClient = createDeviceClient()
  const uiSettingsStore = useUiSettingsStore()
  const artifactStore = useArtifactStore()
  const codeEditorRef = useRef<HTMLDivElement>(null)
  const [copyText, setCopyText] = useState('Copy')
  const [codeLanguage, setCodeLanguage] = useState(() => sanitizeLanguage(block.artifact?.language))
  const lastThrottleRef = useRef(0)

  const { createEditor, updateCode, getEditorView } = useMonaco({
    wordWrap: 'on',
    wrappingIndent: 'same',
    fontFamily: uiSettingsStore.formattedCodeFontFamily
  })

  const throttledDetectLanguage = (code: string) => {
    const now = Date.now()
    if (now - lastThrottleRef.current < 1000) return
    lastThrottleRef.current = now
    setCodeLanguage(sanitizeLanguage(detectLanguage(code)))
  }

  useEffect(() => {
    if (!codeLanguage || codeLanguage === '') {
      throttledDetectLanguage(block.content)
    }
  }, [])

  const isMermaid = useMemo(() => codeLanguage === 'mermaid', [codeLanguage])
  const isPreviewable = useMemo(
    () => codeLanguage === 'html' || codeLanguage === 'svg',
    [codeLanguage]
  )
  const languageIcon = useMemo(() => getLanguageIcon(codeLanguage), [codeLanguage])
  const displayLanguage = useMemo(
    () =>
      DISPLAY_NAMES[codeLanguage] || codeLanguage.charAt(0).toUpperCase() + codeLanguage.slice(1),
    [codeLanguage]
  )

  useEffect(() => {
    if (!block.content) return
    if (codeLanguage === 'mermaid') return
    if (!codeLanguage || codeLanguage === '') throttledDetectLanguage(block.content)
    updateCode(block.content, codeLanguage)
  }, [block.content])

  useEffect(() => {
    const normalizedLang = sanitizeLanguage(block.artifact?.language)
    if (normalizedLang === '') {
      throttledDetectLanguage(block.content)
    } else {
      setCodeLanguage(normalizedLang)
    }
  }, [block.artifact?.language])

  useEffect(() => {
    updateCode(block.content, codeLanguage)
  }, [codeLanguage])

  useEffect(() => {
    if (!codeEditorRef.current) return
    createEditor(codeEditorRef.current, block.content, codeLanguage)
    const editor = getEditorView()
    if (editor) editor.updateOptions({ fontFamily: uiSettingsStore.formattedCodeFontFamily })
  }, [])

  useEffect(() => {
    getEditorView()?.updateOptions({ fontFamily: uiSettingsStore.formattedCodeFontFamily })
  }, [uiSettingsStore.formattedCodeFontFamily])

  const handleCopy = async () => {
    try {
      deviceClient.copyText(block.content)
      setCopyText('Copied!')
      setTimeout(() => setCopyText('Copy'), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const previewCode = () => {
    if (!isPreviewable || !messageId || !threadId) return
    const artifactType = codeLanguage === 'html' ? 'text/html' : 'image/svg+xml'
    const artifactTitle = codeLanguage === 'html' ? 'HTML Preview' : 'SVG Preview'
    artifactStore.showArtifact(
      {
        id: `temp-${codeLanguage}-${nanoid()}`,
        type: artifactType,
        title: artifactTitle,
        language: codeLanguage || block.artifact?.language,
        content: block.content,
        status: 'loaded'
      },
      messageId,
      threadId,
      { force: true }
    )
  }

  if (isMermaid) {
    return (
      <pre className={`text-xs p-3 bg-muted rounded-lg overflow-auto ${className ?? ''}`}>
        {block.content}
      </pre>
    )
  }

  return (
    <div
      className={`m-4 rounded-lg border border-border overflow-hidden shadow-sm ${className ?? ''}`}
    >
      <div className="flex justify-between items-center p-2 bg-muted text-xs">
        <span className="flex items-center space-x-2">
          <Icon icon={languageIcon} className="w-4 h-4" />
          <span className="text-gray-600 dark:text-gray-400 font-mono font-bold">
            {displayLanguage}
          </span>
        </span>
        {isPreviewable ? (
          <div className="flex items-center space-x-2">
            <button
              className="text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
              onClick={handleCopy}
            >
              {copyText}
            </button>
            <button
              className="text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
              onClick={previewCode}
            >
              Preview
            </button>
          </div>
        ) : (
          <button
            className="text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
            onClick={handleCopy}
          >
            {copyText}
          </button>
        )}
      </div>
      <div
        ref={codeEditorRef}
        className="min-h-[30px] max-h-[500px] text-xs overflow-auto bg-background font-mono leading-relaxed"
        data-language={codeLanguage}
      />
      <style>{`.cm-editor .cm-content { font-family: var(--dc-code-font-family) !important; }`}</style>
    </div>
  )
}
