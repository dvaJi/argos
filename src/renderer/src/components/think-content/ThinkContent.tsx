import { useMemo } from 'react'
import { Icon } from '@iconify/react'
import { useThemeStore } from '@/stores/theme'

interface ThinkContentProps {
  label: string
  expanded: boolean
  thinking: boolean
  content?: string
  onToggle?: () => void
}

export default function ThinkContent({
  label,
  expanded,
  thinking,
  content,
  onToggle
}: ThinkContentProps) {
  const themeStore = useThemeStore()

  const sanitizedContent = useMemo(() => {
    if (!content) return ''
    return content.replace(/<style[\s\S]*?<\/style>/gi, '')
  }, [content])

  return (
    <div className="text-xs leading-4 text-[rgba(37,37,37,0.5)] dark:text-white/50 flex flex-col gap-[6px]">
      <div
        className="inline-flex items-center gap-[10px] select-none self-start cursor-pointer"
        onClick={onToggle}
      >
        <span className="whitespace-nowrap">{label}</span>
        {thinking && !expanded ? (
          <Icon
            icon="lucide:ellipsis"
            className="w-[14px] h-[14px] text-[rgba(37,37,37,0.5)] dark:text-white/50 animate-[pulse_1s_ease-in-out_infinite]"
          />
        ) : expanded ? (
          <Icon
            icon="lucide:chevron-down"
            className="w-[14px] h-[14px] text-[rgba(37,37,37,0.5)] dark:text-white/50"
          />
        ) : (
          <Icon
            icon="lucide:chevron-right"
            className="w-[14px] h-[14px] text-[rgba(37,37,37,0.5)] dark:text-white/50"
          />
        )}
      </div>

      {expanded && sanitizedContent && (
        <div
          className="think-prose w-full max-w-full prose prose-sm dark:prose-invert"
          dangerouslySetInnerHTML={{ __html: sanitizedContent }}
        />
      )}

      {thinking && expanded && (
        <Icon
          icon="lucide:ellipsis"
          className="w-[14px] h-[14px] text-[rgba(37,37,37,0.5)] dark:text-white/50 animate-[pulse_1s_ease-in-out_infinite]"
        />
      )}
    </div>
  )
}
