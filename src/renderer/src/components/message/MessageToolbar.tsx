import React, { useState, useMemo, useRef, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { Button } from '@shadcn/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@shadcn/components/ui/tooltip'
import { useUiSettingsStore } from '@/stores/uiSettingsStore'
import { useStore } from '@nanostores/react'

interface MessageToolbarProps {
  usage: {
    context_usage: number
    tokens_per_second: number
    total_tokens: number
    reasoning_start_time: number
    reasoning_end_time: number
    input_tokens: number
    output_tokens: number
  }
  loading: boolean
  isAssistant: boolean
  currentVariantIndex?: number
  totalVariants?: number
  isEditMode?: boolean
  isInGeneratingThread?: boolean
  isCapturingImage: boolean
  showTrace?: boolean
  isReadOnly?: boolean
  onRetry?: () => void
  onDelete?: () => void
  onCopy?: () => void
  onCopyImage?: () => void
  onPrev?: () => void
  onNext?: () => void
  onEdit?: () => void
  onSave?: () => void
  onCancel?: () => void
  onFork?: () => void
  onCopyImageFromTop?: () => void
  onTrace?: () => void
}

export const MessageToolbar: React.FC<MessageToolbarProps> = ({
  usage,
  loading,
  isAssistant,
  currentVariantIndex,
  totalVariants,
  isEditMode,
  isInGeneratingThread,
  isCapturingImage,
  showTrace,
  isReadOnly: isReadOnlyProp,
  onRetry,
  onDelete,
  onCopy,
  onCopyImage,
  onPrev,
  onNext,
  onEdit,
  onSave,
  onCancel,
  onFork,
  onCopyImageFromTop,
  onTrace
}) => {
  const uiSettingsStore = useUiSettingsStore()
  const traceDebugEnabled = useStore(uiSettingsStore, (s) => s.traceDebugEnabled)

  const [showCopyTip, setShowCopyTip] = useState(false)
  const [showCopyImageTip, setShowCopyImageTip] = useState(false)
  const [showCopyFromTopTip, setShowCopyFromTopTip] = useState(false)
  const copyImagePressTimer = useRef<number | null>(null)
  const LONG_PRESS_DURATION = 800

  const hasTokensPerSecond = usage.tokens_per_second > 0
  const hasVariants = (totalVariants || 0) > 1
  const allowTrace = showTrace ?? false
  const isReadOnly = isReadOnlyProp === true

  const handleCopy = useCallback(() => {
    onCopy?.()
    setShowCopyTip(true)
    setTimeout(() => setShowCopyTip(false), 2000)
  }, [onCopy])

  const handleCopyImageStart = useCallback(() => {
    copyImagePressTimer.current = window.setTimeout(() => {
      onCopyImageFromTop?.()
      setShowCopyFromTopTip(true)
      setTimeout(() => setShowCopyFromTopTip(false), 2000)
      copyImagePressTimer.current = null
    }, LONG_PRESS_DURATION)
  }, [onCopyImageFromTop])

  const handleCopyImageEnd = useCallback(() => {
    if (copyImagePressTimer.current) {
      window.clearTimeout(copyImagePressTimer.current)
      copyImagePressTimer.current = null
      onCopyImage?.()
      setShowCopyImageTip(true)
      setTimeout(() => setShowCopyImageTip(false), 2000)
    }
  }, [onCopyImage])

  const handleCopyImageCancel = useCallback(() => {
    if (copyImagePressTimer.current) {
      window.clearTimeout(copyImagePressTimer.current)
      copyImagePressTimer.current = null
    }
  }, [])

  if (isCapturingImage) return null

  return (
    <TooltipProvider ignoreNonKeyboardFocus={true}>
      <div
        className={`w-full h-7 text-xs text-muted-foreground items-center justify-between flex flex-row opacity-0 group-hover:opacity-100 transition-opacity duration-[var(--dc-motion-fast)] ease-[var(--dc-ease-out-soft)] ${
          isAssistant ? '' : 'flex-row-reverse'
        }`}
      >
        <span className={loading ? 'hidden' : 'flex flex-row gap-3'}>
          {isEditMode ? (
            <>
              <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-4 h-4 text-muted-foreground hover:text-primary hover:bg-transparent transition-colors duration-[var(--dc-motion-fast)] ease-[var(--dc-ease-out-soft)]"
                    onClick={onSave}
                  >
                    <Icon icon="lucide:check" className="w-3 h-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Save</TooltipContent>
              </Tooltip>
              <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-4 h-4 text-muted-foreground hover:text-primary hover:bg-transparent transition-colors duration-[var(--dc-motion-fast)] ease-[var(--dc-ease-out-soft)]"
                    onClick={onCancel}
                  >
                    <Icon icon="lucide:x" className="w-3 h-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Cancel</TooltipContent>
              </Tooltip>
            </>
          ) : (
            <>
              {!isAssistant && !isEditMode && !isReadOnly && (
                <Tooltip delayDuration={200}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-4 h-4 text-muted-foreground hover:text-primary hover:bg-transparent transition-colors duration-[var(--dc-motion-fast)] ease-[var(--dc-ease-out-soft)]"
                      onClick={onRetry}
                    >
                      <Icon icon="lucide:refresh-cw" className="w-3 h-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Retry</TooltipContent>
                </Tooltip>
              )}

              <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`w-4 h-4 text-muted-foreground hover:text-primary hover:bg-transparent transition-colors duration-[var(--dc-motion-fast)] ease-[var(--dc-ease-out-soft)] ${isAssistant && hasVariants ? '' : 'hidden'}`}
                    disabled={currentVariantIndex === 0}
                    onClick={onPrev}
                  >
                    <Icon icon="lucide:chevron-left" className="w-3 h-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Previous variant</TooltipContent>
              </Tooltip>

              <span className={isAssistant && hasVariants ? '' : 'hidden'}>
                {(currentVariantIndex ?? 0) + 1} / {totalVariants}
              </span>

              <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`w-4 h-4 text-muted-foreground hover:text-primary hover:bg-transparent transition-colors duration-[var(--dc-motion-fast)] ease-[var(--dc-ease-out-soft)] ${isAssistant && hasVariants ? '' : 'hidden'}`}
                    disabled={(currentVariantIndex ?? 0) >= (totalVariants || 0) - 1}
                    onClick={onNext}
                  >
                    <Icon icon="lucide:chevron-right" className="w-3 h-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Next variant</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative w-4 h-4 text-muted-foreground hover:text-primary hover:bg-transparent transition-colors duration-[var(--dc-motion-fast)] ease-[var(--dc-ease-out-soft)]"
                    onClick={handleCopy}
                  >
                    <Icon icon="lucide:copy" className="w-3 h-3" />
                    {showCopyTip && (
                      <span className="absolute -top-6 left-1/2 transform -translate-x-1/2 bg-background border px-2 py-1 rounded text-xs whitespace-nowrap z-50">
                        Copied
                      </span>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`relative w-4 h-4 text-muted-foreground hover:text-primary hover:bg-transparent transition-colors duration-[var(--dc-motion-fast)] ease-[var(--dc-ease-out-soft)] ${isAssistant ? '' : 'hidden'}`}
                    disabled={isCapturingImage}
                    onMouseDown={handleCopyImageStart}
                    onMouseUp={handleCopyImageEnd}
                    onMouseLeave={handleCopyImageCancel}
                  >
                    {isCapturingImage ? (
                      <Icon icon="lucide:loader" className="w-3 h-3 animate-spin" />
                    ) : (
                      <Icon icon="lucide:images" className="w-3 h-3" />
                    )}
                    {showCopyImageTip && (
                      <span className="absolute -top-6 left-1/2 transform -translate-x-1/2 bg-background border px-2 py-1 rounded text-xs whitespace-nowrap z-50">
                        Image copied
                      </span>
                    )}
                    {showCopyFromTopTip && (
                      <span className="absolute -top-6 left-1/2 transform -translate-x-1/2 bg-background border px-2 py-1 rounded text-xs whitespace-nowrap z-50">
                        Copied from top
                      </span>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {isCapturingImage ? 'Capturing...' : 'Copy image (long press for from top)'}
                </TooltipContent>
              </Tooltip>

              {isAssistant && !isReadOnly && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-4 h-4 text-muted-foreground hover:text-primary hover:bg-transparent transition-colors duration-[var(--dc-motion-fast)] ease-[var(--dc-ease-out-soft)]"
                      onClick={onRetry}
                    >
                      <Icon icon="lucide:refresh-cw" className="w-3 h-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Retry</TooltipContent>
                </Tooltip>
              )}

              {isAssistant && traceDebugEnabled && allowTrace && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-4 h-4 text-muted-foreground hover:text-primary hover:bg-transparent transition-colors duration-[var(--dc-motion-fast)] ease-[var(--dc-ease-out-soft)]"
                      onClick={onTrace}
                    >
                      <Icon icon="lucide:bug" className="w-3 h-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Trace debug</TooltipContent>
                </Tooltip>
              )}

              {isAssistant && !loading && !isInGeneratingThread && !isReadOnly && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-4 h-4 text-muted-foreground hover:text-primary hover:bg-transparent transition-colors duration-[var(--dc-motion-fast)] ease-[var(--dc-ease-out-soft)]"
                      onClick={onFork}
                    >
                      <Icon icon="lucide:git-branch" className="w-3 h-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Fork</TooltipContent>
                </Tooltip>
              )}

              {!isAssistant && !isEditMode && !isReadOnly && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-4 h-4 text-muted-foreground hover:text-primary hover:bg-transparent transition-colors duration-[var(--dc-motion-fast)] ease-[var(--dc-ease-out-soft)]"
                      onClick={onEdit}
                    >
                      <Icon icon="lucide:edit" className="w-3 h-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Edit</TooltipContent>
                </Tooltip>
              )}

              {!isReadOnly && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-4 h-4 text-muted-foreground hover:text-primary hover:bg-transparent transition-colors duration-[var(--dc-motion-fast)] ease-[var(--dc-ease-out-soft)]"
                      onClick={onDelete}
                    >
                      <Icon icon="lucide:trash-2" className="w-3 h-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete</TooltipContent>
                </Tooltip>
              )}
            </>
          )}
        </span>

        <span className="flex flex-row gap-2">
          {(usage.input_tokens > 0 || usage.output_tokens > 0) && (
            <>
              <span className="text-xs flex flex-row items-center">
                <Icon icon="lucide:arrow-up" className="w-3 h-3" />
                {usage.input_tokens}
              </span>
              <span className="text-xs flex flex-row items-center">
                <Icon icon="lucide:arrow-down" className="w-3 h-3" />
                {usage.output_tokens}
              </span>
            </>
          )}
          {hasTokensPerSecond && <>{usage.tokens_per_second?.toFixed(2)}/S</>}
        </span>
      </div>
    </TooltipProvider>
  )
}
