import React, { useMemo } from 'react'
import { Icon } from '@iconify/react'
import { Button } from '@shadcn/components/ui/button'
import type { ToolInteractionResponse } from '@shared/types/agent-interface'
import type { DisplayAssistantMessageBlock } from '@/components/chat/messageListItems'

type PendingInteractionView = {
  messageId: string
  toolCallId: string
  actionType: 'question_request' | 'tool_call_permission'
  toolName: string
  toolArgs: string
  block: DisplayAssistantMessageBlock
}

interface ChatToolInteractionOverlayProps {
  interaction: PendingInteractionView
  processing?: boolean
  embedded?: boolean
  onRespond: (response: ToolInteractionResponse) => void
}

const ChatToolInteractionOverlay: React.FC<ChatToolInteractionOverlayProps> = ({
  interaction,
  processing = false,
  embedded = false,
  onRespond
}) => {
  const isQuestion = useMemo(
    () => interaction.actionType === 'question_request',
    [interaction.actionType]
  )
  const isPermission = useMemo(
    () => interaction.actionType === 'tool_call_permission',
    [interaction.actionType]
  )
  const isSkillDraft = useMemo(
    () => interaction.block.extra?.skillDraftAction === 'confirm',
    [interaction.block.extra?.skillDraftAction]
  )

  const headerIcon = useMemo(
    () => (isQuestion ? 'lucide:message-circle-question' : 'lucide:shield'),
    [isQuestion]
  )

  const headerText = useMemo(() => {
    if (isQuestion) {
      const raw = interaction.block.extra?.questionHeader
      if (typeof raw === 'string' && raw.trim()) {
        return raw.includes('.') ? raw : raw
      }
      return 'Question'
    }
    return 'Permission Request'
  }, [isQuestion, interaction.block.extra?.questionHeader])

  const bodyText = useMemo(() => {
    if (isQuestion) {
      const raw = interaction.block.extra?.questionText
      if (typeof raw === 'string' && raw.trim()) {
        return raw
      }
      return interaction.block.content || ''
    }
    return interaction.block.content || ''
  }, [isQuestion, interaction.block.extra?.questionText, interaction.block.content])

  const skillDraftPreview = useMemo(() => {
    const raw = interaction.block.extra?.skillDraftPreview
    return typeof raw === 'string' ? raw : ''
  }, [interaction.block.extra?.skillDraftPreview])

  const formattedToolArgs = useMemo(() => {
    const raw = interaction.toolArgs || ''
    if (!raw.trim()) return ''
    try {
      return JSON.stringify(JSON.parse(raw) as unknown, null, 2)
    } catch {
      return raw
    }
  }, [interaction.toolArgs])

  type QuestionOptionView = { label: string; rawLabel: string; description?: string }

  const questionOptions = useMemo(() => {
    const raw = interaction.block.extra?.questionOptions
    let items: unknown[] = []
    if (Array.isArray(raw)) {
      items = raw
    } else if (typeof raw === 'string' && raw.trim()) {
      try {
        const parsed = JSON.parse(raw) as unknown
        items = Array.isArray(parsed) ? parsed : []
      } catch {
        items = []
      }
    }
    return items
      .map((item: unknown): QuestionOptionView | null => {
        if (!item || typeof item !== 'object') return null
        const candidate = item as { label?: unknown; description?: unknown }
        if (typeof candidate.label !== 'string') return null
        const label = candidate.label.trim()
        if (!label) return null
        if (typeof candidate.description === 'string' && candidate.description.trim()) {
          return { label, rawLabel: label, description: candidate.description.trim() }
        }
        return { label, rawLabel: label }
      })
      .filter((item): item is QuestionOptionView => Boolean(item))
  }, [interaction.block.extra?.questionOptions])

  const allowOther = useMemo(
    () => interaction.block.extra?.questionCustom !== false,
    [interaction.block.extra?.questionCustom]
  )

  const onPermission = (granted: boolean) => {
    onRespond({ kind: 'permission', granted })
  }

  const onQuestionOption = (option: QuestionOptionView) => {
    onRespond({
      kind: 'question_option',
      optionLabel: isSkillDraft ? option.rawLabel : option.label
    })
  }

  const onQuestionOther = () => {
    onRespond({ kind: 'question_other' })
  }

  return (
    <div
      className={[
        'relative w-full overflow-hidden p-4 text-foreground',
        embedded ? '' : 'tool-interaction-overlay max-w-2xl rounded-xl backdrop-blur-[26px]'
      ].join(' ')}
    >
      {!embedded && <div className="tool-interaction-overlay__backdrop" aria-hidden="true" />}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon icon={headerIcon} className="h-4 w-4" />
        <span>{headerText}</span>
      </div>

      <p className="mt-3 text-sm whitespace-pre-wrap break-words">{bodyText}</p>

      {isSkillDraft && skillDraftPreview && (
        <div className="mt-3 rounded-md border bg-background/60 p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Skill Draft Preview
          </div>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs leading-5">
            {skillDraftPreview}
          </pre>
        </div>
      )}

      {isPermission && (
        <div className="mt-3 space-y-2">
          <div className="rounded-md border bg-muted/50 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Tool</div>
            <div className="text-xs font-medium break-all">{interaction.toolName || '-'}</div>
          </div>
          {formattedToolArgs && (
            <div className="rounded-md border bg-background/50 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Arguments
              </div>
              <pre className="mt-1 text-xs leading-5 whitespace-pre-wrap break-words">
                {formattedToolArgs}
              </pre>
            </div>
          )}
        </div>
      )}

      {isQuestion ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {questionOptions.map((option) => (
            <Button
              key={option.label}
              disabled={processing}
              variant="outline"
              size="sm"
              className="h-auto min-h-8 px-3 py-1.5 text-left"
              onClick={() => onQuestionOption(option)}
            >
              <span className="flex flex-col items-start gap-0.5">
                <span className="text-xs font-medium">{option.label}</span>
                {option.description && (
                  <span className="text-[11px] text-muted-foreground">{option.description}</span>
                )}
              </span>
            </Button>
          ))}
          {allowOther && (
            <Button
              disabled={processing}
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={onQuestionOther}
            >
              Other
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-4 flex gap-2">
          <Button
            disabled={processing}
            variant="outline"
            size="sm"
            className="h-8 flex-1 text-xs"
            onClick={() => onPermission(false)}
          >
            Deny
          </Button>
          <Button
            disabled={processing}
            size="sm"
            className="h-8 flex-1 text-xs"
            onClick={() => onPermission(true)}
          >
            Allow
          </Button>
        </div>
      )}
    </div>
  )
}

export default ChatToolInteractionOverlay
