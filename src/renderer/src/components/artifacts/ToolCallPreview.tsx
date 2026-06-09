import React from 'react'
import { Icon } from '@iconify/react'
import type { ProcessedPart } from '@/composables/useArtifacts'

interface ToolCallPreviewProps {
  block: ProcessedPart
  blockStatus?: string
}

const isBlockError = (block: ProcessedPart, blockStatus?: string): boolean => {
  if (block.tool_call?.status === 'error') return true
  if (blockStatus !== 'loading' && block.loading) return true
  if (blockStatus !== 'loading' && block.tool_call?.status === 'calling') return true
  if (blockStatus !== 'loading' && block.tool_call?.status === 'response') return true
  return false
}

const getToolCallStatus = (block: ProcessedPart, blockStatus?: string): string => {
  if (!block.tool_call) return ''
  if (isBlockError(block, blockStatus)) return 'Error'
  switch (block.tool_call.status) {
    case 'calling':
      return 'Calling...'
    case 'response':
      return 'Responding...'
    case 'end':
      return 'Complete'
    case 'error':
      return 'Error'
    default:
      return ''
  }
}

export function ToolCallPreview({ block, blockStatus }: ToolCallPreviewProps) {
  const status = getToolCallStatus(block, blockStatus)
  const isError = isBlockError(block, blockStatus)

  return (
    <div>
      <div className="flex w-[360px] h-[40px] max-w-full break-all shadow-sm my-2 items-center gap-2 rounded-lg border bg-card text-card-foreground">
        <div className="grow w-0 pl-2">
          <h4 className="text-xs font-medium leading-none text-accent-foreground flex flex-row gap-2 items-center">
            <Icon icon="lucide:hammer" className="w-4 h-4 text-muted-foreground" />
            {block.tool_call?.name ?? ''}
          </h4>
        </div>
        <div className="text-xs text-muted-foreground">{status}</div>
        <div className="shrink-0 px-2 rounded-lg rounded-l-none flex justify-center items-center">
          {block.loading && (blockStatus === 'loading' || !blockStatus) && (
            <Icon icon="lucide:loader-2" className="w-4 h-4 animate-spin text-muted-foreground" />
          )}
          {block.tool_call &&
            block.tool_call.status === 'end' &&
            !(block.loading && (blockStatus === 'loading' || !blockStatus)) && (
              <Icon
                icon="lucide:check"
                className="w-4 h-4 bg-green-500 rounded-full text-white p-0.5 dark:bg-green-800"
              />
            )}
          {isError && !(block.tool_call && block.tool_call.status === 'end') && (
            <Icon
              icon="lucide:x"
              className="w-4 h-4 text-white p-0.5 bg-red-500 rounded-full dark:bg-red-800"
            />
          )}
        </div>
      </div>
    </div>
  )
}
