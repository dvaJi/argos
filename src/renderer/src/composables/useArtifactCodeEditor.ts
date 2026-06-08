import { useState, useEffect, useRef, useCallback } from 'react'
import type { ArtifactState } from '@/stores/artifact'
import { useMonaco, detectLanguage } from 'stream-monaco'
import { uiSettingsStore } from '@/stores/uiSettingsStore'
import { useStore } from '@tanstack/react-store'

const sanitizeLanguage = (language: string | undefined | null): string => {
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

const normalizeLanguage = (artifact: ArtifactState | null): string => {
  if (!artifact) return ''

  const explicit = sanitizeLanguage(artifact.language)
  if (explicit) {
    return explicit
  }

  switch (artifact.type) {
    case 'application/vnd.ant.code':
      return 'plaintext'
    case 'text/markdown':
      return 'markdown'
    case 'text/html':
      return 'html'
    case 'image/svg+xml':
      return 'svg'
    case 'application/vnd.ant.mermaid':
      return 'mermaid'
    case 'application/vnd.ant.react':
      return 'jsx'
    default:
      return sanitizeLanguage(artifact.type)
  }
}

export function useArtifactCodeEditor(
  artifact: ArtifactState | null,
  editorElement: HTMLElement | null,
  isPreview: boolean,
  isOpen: boolean
) {
  const [codeLanguage, setCodeLanguage] = useState(() => normalizeLanguage(artifact))
  const formattedCodeFontFamily = useStore(uiSettingsStore, (s) => s.formattedCodeFontFamily)

  const { createEditor, updateCode, cleanupEditor, getEditorView } = useMonaco({
    MAX_HEIGHT: '100%',
    wordWrap: 'on',
    wrappingIndent: 'same',
    fontFamily: formattedCodeFontFamily
  })

  const lastDetectTimeRef = useRef(0)
  const trailingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingCodeRef = useRef<string | null>(null)

  const throttledDetectLanguage = useCallback((code: string) => {
    const now = Date.now()
    pendingCodeRef.current = code

    if (now - lastDetectTimeRef.current >= 1000) {
      lastDetectTimeRef.current = now
      setCodeLanguage(sanitizeLanguage(detectLanguage(code)))
      if (trailingTimerRef.current) {
        clearTimeout(trailingTimerRef.current)
        trailingTimerRef.current = null
      }
    } else if (!trailingTimerRef.current) {
      trailingTimerRef.current = setTimeout(
        () => {
          trailingTimerRef.current = null
          lastDetectTimeRef.current = Date.now()
          if (pendingCodeRef.current !== null) {
            setCodeLanguage(sanitizeLanguage(detectLanguage(pendingCodeRef.current)))
          }
        },
        1000 - (now - lastDetectTimeRef.current)
      )
    }
  }, [])

  useEffect(() => {
    if (!artifact) {
      setCodeLanguage('')
      return
    }

    const normalizedLanguage = normalizeLanguage(artifact)
    if (normalizedLanguage !== codeLanguage) {
      setCodeLanguage(normalizedLanguage)
    }

    if (normalizedLanguage === 'mermaid') {
      return
    }

    const newCode = artifact.content || ''

    if (!normalizedLanguage) {
      throttledDetectLanguage(newCode)
    }

    updateCode(newCode, normalizedLanguage)
  }, [artifact?.id, artifact?.content, artifact?.language, artifact?.type, artifact?.status])

  useEffect(() => {
    if (!codeLanguage && artifact?.content !== undefined) {
      throttledDetectLanguage(artifact.content || '')
    }
  }, [])

  useEffect(() => {
    updateCode(artifact?.content || '', codeLanguage)
  }, [codeLanguage])

  useEffect(() => {
    if (artifact?.content !== undefined) {
      updateCode(artifact.content, codeLanguage)
    }
  }, [artifact?.content])

  useEffect(() => {
    if (!isOpen || isPreview || !editorElement) return
    void createEditor(editorElement, artifact?.content || '', codeLanguage)
    const editor = getEditorView()
    if (editor) {
      editor.updateOptions({ fontFamily: formattedCodeFontFamily })
    }
  }, [editorElement, isPreview, isOpen])

  useEffect(() => {
    if (isPreview) {
      cleanupEditor()
    }
  }, [isPreview])

  useEffect(() => {
    if (!editorElement) {
      cleanupEditor()
    }
  }, [editorElement])

  useEffect(() => {
    if (!isOpen) {
      cleanupEditor()
    }
  }, [isOpen])

  useEffect(() => {
    return () => {
      cleanupEditor()
      if (trailingTimerRef.current) {
        clearTimeout(trailingTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const editor = getEditorView()
    if (editor) {
      editor.updateOptions({ fontFamily: formattedCodeFontFamily })
    }
  }, [formattedCodeFontFamily])

  return {
    codeLanguage
  }
}
