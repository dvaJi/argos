import React, { useMemo, useRef } from 'react'
import { Icon } from '@iconify/react'
import type { SearchResult } from '@shared/types/core/search'

interface ReferencePreviewProps {
  show: boolean
  content: SearchResult | undefined
  rect?: DOMRect
}

export const ReferencePreview: React.FC<ReferencePreviewProps> = ({ show, content, rect }) => {
  const previewEl = useRef<HTMLDivElement>(null)

  const positionStyle = useMemo(() => {
    if (!rect) return {}

    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const previewWidth = 384
    const previewHeight = previewEl.current?.offsetHeight || 200

    let top = rect.bottom + window.scrollY + 8
    let left = rect.left + window.scrollX

    if (left + previewWidth > viewportWidth) {
      left = viewportWidth - previewWidth - 16
    }

    if (top + previewHeight > viewportHeight + window.scrollY) {
      top = rect.top + window.scrollY - previewHeight - 8
    }

    return {
      top: `${top}px`,
      left: `${left}px`
    }
  }, [rect, content])

  if (!show) return null

  return (
    <div
      ref={previewEl}
      className="reference-preview fixed z-50 max-w-[384px] bg-card rounded-lg shadow-lg p-3 sm:p-4"
      style={positionStyle}
    >
      <div className="space-y-1.5 sm:space-y-2">
        <div className="flex items-center gap-1.5 sm:gap-2">
          {content?.icon ? (
            <img
              src={content.icon}
              className="w-3 h-3 sm:w-4 sm:h-4 rounded"
              alt={content?.title}
            />
          ) : (
            <Icon icon="lucide:globe" className="w-3 h-3 sm:w-4 sm:h-4" />
          )}
          <h3 className="font-medium text-xs sm:text-sm line-clamp-1">{content?.title}</h3>
        </div>

        <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">
          {content?.description || content?.content}
        </p>

        <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-muted-foreground">
          <Icon icon="lucide:link" className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
          <span className="truncate">{content?.url}</span>
        </div>
      </div>
    </div>
  )
}
