import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { Icon } from '@iconify/react'
import { useI18n } from 'vue-i18n'
import MessageInfo from './MessageInfo'
import ChatAttachmentItem from '../chat/ChatAttachmentItem'
import MessageToolbar from './MessageToolbar'
import MessageContent from './MessageContent'
import MessageTextContent from './MessageTextContent'
import { createDeviceClient } from '@api/DeviceClient'
import { createWindowClient } from '@api/WindowClient'
import type {
  DisplayUserMessage,
  DisplayUserMessageTextBlock,
  DisplayUserMessageCodeBlock,
  DisplayUserMessageMentionBlock
} from '@/components/chat/messageListItems'

const COLLAPSE_CHAR_THRESHOLD = 600
const COLLAPSE_EXPLICIT_LINE_THRESHOLD = 8

type DisplayUserMessageRichBlock =
  | DisplayUserMessageTextBlock
  | DisplayUserMessageMentionBlock
  | DisplayUserMessageCodeBlock

const getVisibleMentionLabel = (block: DisplayUserMessageMentionBlock) => {
  if (block.category === 'prompts') return block.id || block.content
  if (block.category === 'context') return block.id || block.category
  return block.content
}

const getVisibleBlockText = (block: DisplayUserMessageRichBlock) => {
  if (block.type === 'mention') return getVisibleMentionLabel(block)
  return block.content
}

const getVisibleMessageText = (message: DisplayUserMessage) => {
  const blocks = message.content.content
  if (blocks && blocks.length > 0) return blocks.map((block) => getVisibleBlockText(block)).join('')
  return message.content.text || ''
}

const countExplicitLines = (value: string) => {
  if (!value) return 0
  let count = 1
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code === 10) {
      count += 1
    } else if (code === 13) {
      count += 1
      if (value.charCodeAt(index + 1) === 10) index += 1
    }
  }
  return count
}

interface MessageItemUserProps {
  message: DisplayUserMessage
  isReadOnly?: boolean
  onFileClick?: (fileName: string) => void
  onRetry?: (messageId: string) => void
  onDelete?: (messageId: string) => void
  onEditSave?: (payload: { messageId: string; text: string }) => void
}

export const MessageItemUser: React.FC<MessageItemUserProps> = ({
  message,
  isReadOnly = false,
  onFileClick,
  onRetry,
  onDelete,
  onEditSave
}) => {
  const deviceClient = createDeviceClient()
  const windowClient = createWindowClient()

  const [isEditMode, setIsEditMode] = useState(false)
  const [editedText, setEditedText] = useState('')
  const editTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [isExpanded, setIsExpanded] = useState(true)
  const [hasManualCollapsePreference, setHasManualCollapsePreference] = useState(false)
  const pendingResizeFrameRef = useRef<number | null>(null)

  const visibleMessageText = useMemo(() => getVisibleMessageText(message), [message])
  const explicitLineCount = useMemo(
    () => countExplicitLines(visibleMessageText),
    [visibleMessageText]
  )
  const isCollapsible = useMemo(
    () =>
      visibleMessageText.length >= COLLAPSE_CHAR_THRESHOLD ||
      explicitLineCount >= COLLAPSE_EXPLICIT_LINE_THRESHOLD,
    [visibleMessageText, explicitLineCount]
  )
  const shouldClampContent = useMemo(
    () => isCollapsible && !isExpanded,
    [isCollapsible, isExpanded]
  )
  const showFadeMask = shouldClampContent

  const previewFile = (filePath: string) => {
    void windowClient.previewFile(filePath)
  }

  const toggleExpanded = () => {
    if (!isCollapsible) return
    setIsExpanded((prev) => !prev)
    setHasManualCollapsePreference(true)
  }

  const runAutoResize = () => {
    const el = editTextareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const maxH = Math.max(120, Math.floor(window.innerHeight * 0.6))
    const scrollH = el.scrollHeight
    const target = Math.min(scrollH, maxH)
    el.style.height = target + 'px'
    el.style.overflowY = scrollH > target ? 'auto' : 'hidden'
  }

  const autoResize = () => {
    if (pendingResizeFrameRef.current !== null)
      window.cancelAnimationFrame(pendingResizeFrameRef.current)
    pendingResizeFrameRef.current = window.requestAnimationFrame(() => {
      pendingResizeFrameRef.current = null
      runAutoResize()
    })
  }

  const startEdit = () => {
    if (isReadOnly) return
    setIsEditMode(true)
    if (message.content?.content && message.content.content.length > 0) {
      const textBlocks = message.content.content.filter((block) => block.type === 'text')
      setEditedText(textBlocks.map((block) => block.content).join(''))
    } else {
      setEditedText(message.content.text || '')
    }
    setTimeout(() => autoResize(), 0)
  }

  const saveEdit = () => {
    if (isReadOnly) return
    const nextText = editedText.trim()
    if (!nextText) return
    onEditSave?.({ messageId: message.id, text: nextText })
    setIsEditMode(false)
  }

  const cancelEdit = () => setIsEditMode(false)

  const getCopyText = () => {
    if (message.content?.content && message.content.content.length > 0) {
      return message.content.content
        .map((block) => (typeof block.content === 'string' ? block.content : ''))
        .join('')
        .trim()
    }
    return message.content.text || ''
  }

  const handleAction = (action: 'delete' | 'copy') => {
    if (action === 'delete') {
      if (isReadOnly) return
      onDelete?.(message.id)
    } else if (action === 'copy') {
      deviceClient.copyText(getCopyText())
    }
  }

  const handleMentionClick = async (_block: DisplayUserMessageMentionBlock) => {
    return
  }

  useEffect(() => {
    if (!isCollapsible) {
      setIsExpanded(true)
      setHasManualCollapsePreference(false)
      return
    }
    if (!hasManualCollapsePreference) setIsExpanded(false)
  }, [message.id, visibleMessageText, isCollapsible])

  useEffect(() => {
    if (isEditMode) setTimeout(() => autoResize(), 0)
  }, [editedText])

  useEffect(() => {
    return () => {
      if (pendingResizeFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingResizeFrameRef.current)
        pendingResizeFrameRef.current = null
      }
    }
  }, [])

  if (message.content.continue) return null

  return (
    <div
      data-testid="chat-message-user"
      data-message-id={message.id}
      className="flex flex-row-reverse group pt-5 pl-11 gap-2 user-message-item"
    >
      <div className="w-5 h-5 bg-muted rounded-md overflow-hidden">
        {message.avatar ? (
          <img src={message.avatar} className="w-full h-full" alt={message.role} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <Icon icon="lucide:user" className="w-4 h-4" />
          </div>
        )}
      </div>
      <div className="flex flex-col w-full space-y-1.5 items-end">
        <MessageInfo
          className="flex-row-reverse"
          name={message.name ?? 'user'}
          timestamp={message.timestamp}
        />
        <div
          className="text-sm bg-muted dark:bg-muted rounded-lg p-2 border flex flex-col gap-1.5"
          data-message-content="true"
        >
          {message.content.files.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {message.content.files.map((file, index) => (
                <ChatAttachmentItem
                  key={file.path || `${file.name}-${index}`}
                  file={file}
                  onClick={() => previewFile(file.path)}
                />
              ))}
            </div>
          )}

          {isEditMode ? (
            <div className="text-sm w-full min-w-[40vw] whitespace-pre-wrap break-all">
              <textarea
                ref={editTextareaRef}
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                className="text-sm bg-muted dark:bg-muted rounded-lg p-2 border flex flex-col gap-1.5 resize-none overflow-y-auto overscroll-contain min-w-[40vw] w-full max-h-[60vh]"
                rows={1}
                onInput={autoResize}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault()
                    saveEdit()
                  }
                  if (e.key === 'Escape') cancelEdit()
                }}
              />
            </div>
          ) : (
            <div className="flex w-full min-w-0 flex-col items-end gap-1.5">
              <div
                data-user-message-content-body="true"
                data-user-message-collapsible={String(isCollapsible)}
                data-user-message-expanded={String(isExpanded)}
                className="relative w-full min-w-0"
              >
                <div
                  className={[
                    'w-full min-w-0',
                    shouldClampContent ? 'user-message-content--clamped' : ''
                  ].join(' ')}
                >
                  {message.content.content && message.content.content.length > 0 ? (
                    <MessageContent
                      content={message.content.content}
                      onMentionClick={handleMentionClick}
                    />
                  ) : (
                    <MessageTextContent content={message.content.text || ''} />
                  )}
                </div>
                {showFadeMask && (
                  <div
                    data-user-message-fade="true"
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-12 rounded-b-md bg-gradient-to-t from-muted via-muted/95 to-transparent"
                  />
                )}
              </div>
              {isCollapsible && (
                <button
                  type="button"
                  data-user-message-toggle="true"
                  className="text-xs leading-5 text-muted-foreground transition-colors hover:text-foreground"
                  onClick={toggleExpanded}
                >
                  {isExpanded ? 'Collapse' : 'Expand'}
                </button>
              )}
            </div>
          )}
        </div>
        <MessageToolbar
          className="flex-row-reverse"
          usage={message.usage}
          loading={false}
          isAssistant={false}
          isEditMode={isEditMode}
          isCapturingImage={false}
          isReadOnly={isReadOnly}
          onRetry={() => {
            if (!isReadOnly) onRetry?.(message.id)
          }}
          onDelete={() => handleAction('delete')}
          onCopy={() => handleAction('copy')}
          onEdit={startEdit}
          onSave={saveEdit}
          onCancel={cancelEdit}
        />
      </div>

      <style>{`
        .user-message-content--clamped {
          display: -webkit-box;
          overflow: hidden;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 12;
        }
      `}</style>
    </div>
  )
}

export default MessageItemUser
