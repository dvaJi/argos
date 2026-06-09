import React from 'react'
import { Icon } from '@iconify/react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '@shadcn/components/ui/context-menu'

interface MessageBlockAudioProps {
  block: import('@/components/chat/messageListItems').DisplayAssistantMessageBlock
  messageId?: string
  threadId?: string
}

type LegacyAudioBlockContent = {
  data?: string
  mimeType?: string
}

const parseAudioDataUri = (value: string): { data: string; mimeType: string } | null => {
  const match = value.match(/^data:([^;]+);base64,(.*)$/)
  if (!match?.[1] || !match?.[2]) return null
  if (!match[1].startsWith('audio/')) return null
  return { data: match[2], mimeType: match[1] }
}

const normalizeAudioData = (rawData: string, mimeType?: string) => {
  const trimmed = rawData.trim()
  if (!trimmed) return null
  const parsed = parseAudioDataUri(trimmed)
  if (parsed) return parsed

  const normalizedMimeType = mimeType?.trim() || 'audio/mpeg'
  return { data: trimmed, mimeType: normalizedMimeType }
}

export const MessageBlockAudio: React.FC<MessageBlockAudioProps> = ({ block }) => {
  const [audioError, setAudioError] = React.useState(false)

  const resolvedAudioData = React.useMemo(() => {
    if (block.image_data?.data) {
      return normalizeAudioData(block.image_data.data, block.image_data.mimeType)
    }

    const content = block.content
    if (content && typeof content === 'object' && 'data' in (content as LegacyAudioBlockContent)) {
      const legacyContent = content as LegacyAudioBlockContent
      if (legacyContent.data) {
        return normalizeAudioData(legacyContent.data, legacyContent.mimeType)
      }
    }

    if (typeof content === 'string' && content.length > 0) {
      return normalizeAudioData(content)
    }

    return null
  }, [block.image_data, block.content])

  const audioSrc = React.useMemo(() => {
    if (!resolvedAudioData) return ''
    const raw = resolvedAudioData.data
    if (raw.startsWith('imgcache://') || raw.startsWith('http://') || raw.startsWith('https://')) {
      return raw
    }
    return `data:${resolvedAudioData.mimeType};base64,${raw}`
  }, [resolvedAudioData])

  return (
    <div className="my-1">
      <div className="rounded-lg border bg-card text-card-foreground p-4 w-fit">
        <div className="flex flex-col space-y-2">
          <div className="flex justify-center">
            {resolvedAudioData ? (
              <div className="flex min-w-90 flex-col gap-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Icon icon="lucide:music-2" className="h-4 w-4" />
                  <span>Audio</span>
                </div>
                <div className="rounded-xl border bg-muted/30 p-3">
                  <audio src={audioSrc} controls className="w-full" />
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {resolvedAudioData.mimeType}
                </div>
                {audioError && <div className="text-xs text-red-500">Request failed</div>}
              </div>
            ) : (
              <div className="flex items-center justify-center h-40 w-full">
                <Icon
                  icon="lucide:loader-2"
                  className="w-6 h-6 animate-spin text-muted-foreground"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
