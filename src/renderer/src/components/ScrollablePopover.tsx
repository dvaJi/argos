import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@shadcn/components/ui/popover'
import type { HTMLAttributes, ReactNode } from 'react'

interface ScrollablePopoverProps {
  align?: 'start' | 'center' | 'end'
  enableScrollable?: boolean
  contentClass?: HTMLAttributes['class']
  children?: ReactNode
  trigger?: ReactNode
}

export default function ScrollablePopover({
  align = 'center',
  enableScrollable = false,
  contentClass = '',
  children,
  trigger
}: ScrollablePopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align={align}
        className={cn('p-0', contentClass, enableScrollable && 'max-h-96 overflow-hidden')}
      >
        {enableScrollable ? <div className="max-h-96 overflow-y-auto">{children}</div> : children}
      </PopoverContent>
    </Popover>
  )
}
