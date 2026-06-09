import React, { useEffect, useRef, useCallback } from 'react'
import MessageItemAssistant from '@/components/message/MessageItemAssistant'
import MessageItemUser from '@/components/message/MessageItemUser'
import {
  type DisplayAssistantMessage,
  isCompactionMessageItem,
  type DisplayUserMessage,
  type MessageListItem
} from './messageListItems'

interface MessageListRowProps {
  item: MessageListItem
  isGenerating?: boolean
  showTrace?: boolean
  isCapturing?: boolean
  isReadOnly?: boolean
  onRetry: (messageId: string) => void
  onDelete: (messageId: string) => void
  onFork: (messageId: string) => void
  onContinue: (conversationId: string, messageId: string) => void
  onTrace: (messageId: string) => void
  onEditSave: (payload: { messageId: string; text: string }) => void
  onCopyImage: (
    messageId: string,
    parentId: string | undefined,
    fromTop: boolean,
    modelInfo: { model_name: string; model_provider: string }
  ) => void
  onMeasure: (payload: { messageId: string; height: number }) => void
}

const MessageListRow: React.FC<MessageListRowProps> = ({
  item,
  isGenerating = false,
  showTrace = false,
  isCapturing = false,
  isReadOnly = false,
  onRetry,
  onDelete,
  onFork,
  onContinue,
  onTrace,
  onEditSave,
  onCopyImage,
  onMeasure
}) => {
  const rowRef = useRef<HTMLElement | null>(null)
  let resizeObserverRef = useRef<ResizeObserver | null>(null)
  let intersectionObserverRef = useRef<IntersectionObserver | null>(null)
  let measureFrameRef = useRef<number | null>(null)
  let lastMeasuredHeightRef = useRef(0)
  let hasBeenVisibleRef = useRef(typeof IntersectionObserver === 'undefined')

  const emitMeasuredHeight = useCallback(() => {
    if (!hasBeenVisibleRef.current) return
    if (measureFrameRef.current !== null) return

    measureFrameRef.current = window.requestAnimationFrame(() => {
      measureFrameRef.current = null
      const messageId = item?.id
      if (!messageId) return
      const height = rowRef.current?.offsetHeight ?? 0
      if (height <= 0 || Math.abs(height - lastMeasuredHeightRef.current) < 1) return
      lastMeasuredHeightRef.current = height
      onMeasure({ messageId, height })
    })
  }, [item?.id, onMeasure])

  useEffect(() => {
    const el = rowRef.current
    if (!el) return

    if (typeof IntersectionObserver !== 'undefined') {
      const io = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return
          hasBeenVisibleRef.current = true
          emitMeasuredHeight()
          io.disconnect()
        },
        { rootMargin: '200px 0px' }
      )
      io.observe(el)
      intersectionObserverRef.current = io
    } else {
      emitMeasuredHeight()
    }

    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(emitMeasuredHeight)
    ro.observe(el)
    resizeObserverRef.current = ro

    return () => {
      ro.disconnect()
      resizeObserverRef.current = null
      intersectionObserverRef.current?.disconnect()
      intersectionObserverRef.current = null
      if (measureFrameRef.current !== null) {
        window.cancelAnimationFrame(measureFrameRef.current)
        measureFrameRef.current = null
      }
    }
  }, [emitMeasuredHeight])

  useEffect(() => {
    lastMeasuredHeightRef.current = 0
    emitMeasuredHeight()
  }, [item?.id, emitMeasuredHeight])

  const getCompactionCopy = (status?: 'compacting' | 'compacted'): string =>
    status === 'compacting' ? 'Compacting...' : 'Context compacted'

  return (
    <div
      ref={rowRef as React.RefObject<HTMLDivElement>}
      className="message-list-row"
      data-message-id={item.id}
      data-message-role={item.role}
    >
      {isCompactionMessageItem(item) ? (
        <div
          data-compaction-indicator="true"
          data-compaction-status={item.compactionStatus ?? 'compacted'}
          className="compaction-divider"
        >
          <div className="compaction-divider__line" />
          <span
            className={`compaction-divider__label ${item.compactionStatus === 'compacting' ? 'compaction-divider__label--compacting' : ''}`}
          >
            {getCompactionCopy(item.compactionStatus)}
          </span>
          <div className="compaction-divider__line" />
        </div>
      ) : item.role === 'user' ? (
        <MessageItemUser
          message={item as DisplayUserMessage}
          isReadOnly={isReadOnly}
          onRetry={onRetry}
          onDelete={onDelete}
          onEditSave={onEditSave}
        />
      ) : item.role === 'assistant' ? (
        <MessageItemAssistant
          message={item as DisplayAssistantMessage}
          useLegacyActions={false}
          isInGeneratingThread={isGenerating}
          showTrace={showTrace}
          isCapturingImage={isCapturing}
          isReadOnly={isReadOnly}
          onRetry={onRetry}
          onDelete={onDelete}
          onFork={onFork}
          onContinue={onContinue}
          onTrace={onTrace}
          onCopyImage={onCopyImage}
        />
      ) : null}
    </div>
  )
}

export default MessageListRow
