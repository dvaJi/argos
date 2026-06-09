import { useMemo } from 'react'
import { Icon } from '@iconify/react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@shadcn/components/ui/tooltip'
import { getMimeTypeIcon } from '@/lib/utils'

interface FileItemProps {
  fileName: string
  deletable: boolean
  mimeType?: string
  tokens: number
  thumbnail?: string
  context?: 'input' | 'message'
  onClick?: (fileName: string) => void
  onDelete?: (fileName: string) => void
}

export default function FileItem({
  fileName,
  deletable,
  mimeType = 'text/plain',
  tokens,
  thumbnail,
  context = 'message',
  onClick,
  onDelete
}: FileItemProps) {
  const getFileIcon = () => getMimeTypeIcon(mimeType)

  const isImageFile = mimeType?.startsWith('image/') || false

  return (
    <div className="inline-block">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {isImageFile && thumbnail && context === 'message' ? (
              <div
                className="flex flex-col gap-2 bg-card border items-center shadow-sm justify-start rounded-md text-xs select-none hover:bg-accent relative p-2"
                onClick={() => onClick?.(fileName)}
              >
                <img src={thumbnail} className="w-20 h-20 rounded-md border object-cover" />
                <div className="text-center max-w-20">
                  <div className="text-xs leading-none pb-1 truncate text-ellipsis whitespace-nowrap">
                    {fileName}
                  </div>
                  <div className="text-[10px] leading-none text-muted-foreground truncate text-ellipsis whitespace-nowrap">
                    {mimeType}
                  </div>
                </div>
                {deletable && (
                  <span
                    className="bg-card shadow-sm flex items-center justify-center absolute rounded-full -top-1 -right-1 p-0.5 border"
                    onClick={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      onDelete?.(fileName)
                    }}
                  >
                    <Icon icon="lucide:x" className="w-3 h-3 text-muted-foreground" />
                  </span>
                )}
              </div>
            ) : (
              <div
                className="flex py-1.5 pl-1.5 pr-3 gap-2 flex-row bg-card border items-center shadow-sm justify-start rounded-md text-xs select-none hover:bg-accent relative"
                onClick={() => onClick?.(fileName)}
              >
                {thumbnail ? (
                  <img src={thumbnail} className="w-8 h-8 rounded-md border" />
                ) : (
                  <Icon
                    icon={getFileIcon()}
                    className="w-8 h-8 text-muted-foreground p-1 bg-accent rounded-md border"
                  />
                )}
                <div className="grow flex-1 max-w-28">
                  <div className="text-xs leading-none pb-1 truncate text-ellipsis whitespace-nowrap">
                    {fileName}
                  </div>
                  <div className="text-[10px] leading-none text-muted-foreground truncate text-ellipsis whitespace-nowrap">
                    {mimeType}
                  </div>
                </div>
                {deletable && (
                  <span
                    className="bg-card shadow-sm flex items-center justify-center absolute rounded-full -top-1 -right-2 p-0.5 border"
                    onClick={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      onDelete?.(fileName)
                    }}
                  >
                    <Icon icon="lucide:x" className="w-3 h-3 text-muted-foreground" />
                  </span>
                )}
              </div>
            )}
          </TooltipTrigger>
          <TooltipContent>
            <p>{tokens} tokens</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
}
