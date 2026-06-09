import React, { useEffect } from 'react'
import { createLegacyIpcSubscriptionScope } from '@api/legacy/runtime'

export const SelectedTextContextMenu: React.FC = () => {
  useEffect(() => {
    const contextMenuEventScope = createLegacyIpcSubscriptionScope()

    const handleTranslate = (text: string, x?: number, y?: number) => {
      window.dispatchEvent(
        new CustomEvent('context-menu-translate-text', {
          detail: { text, x, y }
        })
      )
    }

    const handleAskAI = (text: string) => {
      window.dispatchEvent(new CustomEvent('context-menu-ask-ai', { detail: text }))
    }

    contextMenuEventScope.on(
      'context-menu-translate',
      (_: unknown, text: string, x?: number, y?: number) => {
        handleTranslate(text, x, y)
      }
    )
    contextMenuEventScope.on('context-menu-ask-ai', (_: unknown, text: string) => {
      handleAskAI(text)
    })

    return () => {
      contextMenuEventScope.cleanup()
    }
  }, [])

  return <div></div>
}
