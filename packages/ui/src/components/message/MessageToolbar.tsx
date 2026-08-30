import { type FC, type MouseEventHandler, type ReactNode, useState, useRef } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "#shadcn/components/ui/tooltip";
import { useUiSettingsStore } from "#/stores/uiSettingsStore";
interface MessageToolbarProps {
  usage: {
    context_usage: number;
    tokens_per_second: number;
    total_tokens: number;
    reasoning_start_time: number;
    reasoning_end_time: number;
    input_tokens: number;
    output_tokens: number;
  };
  loading: boolean;
  isAssistant: boolean;
  currentVariantIndex?: number;
  totalVariants?: number;
  isEditMode?: boolean;
  isInGeneratingThread?: boolean;
  isCapturingImage: boolean;
  showTrace?: boolean;
  isReadOnly?: boolean;
  onRetry?: () => void;
  onDelete?: () => void;
  onCopy?: () => void;
  onCopyImage?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onEdit?: () => void;
  onSave?: () => void;
  onCancel?: () => void;
  onFork?: () => void;
  onCopyImageFromTop?: () => void;
  onTrace?: () => void;
}
const LONG_PRESS_DURATION = 800;
const TOOLBAR_BUTTON_BASE_CLASS =
  "w-4 h-4 text-muted-foreground hover:text-primary hover:bg-transparent transition-colors duration-[var(--dc-motion-fast)] ease-[var(--dc-ease-out-soft)]";
const TOOLBAR_TIP_CLASS =
  "absolute -top-6 left-1/2 transform -translate-x-1/2 bg-background border px-2 py-1 rounded text-xs whitespace-nowrap z-50";
const ToolbarIconButton = ({
  icon,
  iconClassName = "w-3 h-3",
  tooltip,
  onClick,
  disabled,
  className,
  onMouseDown,
  onMouseUp,
  onMouseLeave,
  children,
}: {
  icon: string;
  iconClassName?: string;
  tooltip: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  onMouseDown?: MouseEventHandler<HTMLButtonElement>;
  onMouseUp?: MouseEventHandler<HTMLButtonElement>;
  onMouseLeave?: MouseEventHandler<HTMLButtonElement>;
  children?: ReactNode;
}) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <Button
          variant="ghost"
          size="icon"
          className={[TOOLBAR_BUTTON_BASE_CLASS, className].filter(Boolean).join(" ")}
          onClick={onClick}
          disabled={disabled}
          onMouseDown={onMouseDown}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseLeave}
        />
      }
    >
      <Icon icon={icon} className={iconClassName} />
      {children}
    </TooltipTrigger>
    <TooltipContent>{tooltip}</TooltipContent>
  </Tooltip>
);
const MessageUsageStats = ({
  usage,
  hasTokensPerSecond,
}: {
  usage: MessageToolbarProps["usage"];
  hasTokensPerSecond: boolean;
}) => (
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
);
export const MessageToolbar: FC<MessageToolbarProps> = ({
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
  onTrace,
}) => {
  const uiSettings = useUiSettingsStore();
  const traceDebugEnabled = uiSettings.traceDebugEnabled;
  const [showCopyTip, setShowCopyTip] = useState(false);
  const [showCopyImageTip, setShowCopyImageTip] = useState(false);
  const [showCopyFromTopTip, setShowCopyFromTopTip] = useState(false);
  const copyImagePressTimer = useRef<number | null>(null);
  const hasTokensPerSecond = usage.tokens_per_second > 0;
  const hasVariants = (totalVariants || 0) > 1;
  const allowTrace = showTrace ?? false;
  const isReadOnly = isReadOnlyProp === true;
  const handleCopy = () => {
    onCopy?.();
    setShowCopyTip(true);
    setTimeout(() => setShowCopyTip(false), 2000);
  };
  const handleCopyImageStart = () => {
    copyImagePressTimer.current = window.setTimeout(() => {
      onCopyImageFromTop?.();
      setShowCopyFromTopTip(true);
      setTimeout(() => setShowCopyFromTopTip(false), 2000);
      copyImagePressTimer.current = null;
    }, LONG_PRESS_DURATION);
  };
  const handleCopyImageEnd = () => {
    if (copyImagePressTimer.current) {
      window.clearTimeout(copyImagePressTimer.current);
      copyImagePressTimer.current = null;
      onCopyImage?.();
      setShowCopyImageTip(true);
      setTimeout(() => setShowCopyImageTip(false), 2000);
    }
  };
  const handleCopyImageCancel = () => {
    if (copyImagePressTimer.current) {
      window.clearTimeout(copyImagePressTimer.current);
      copyImagePressTimer.current = null;
    }
  };
  if (isCapturingImage) return null;
  return (
    <div
      className={`w-full h-7 text-xs text-muted-foreground items-center justify-between flex flex-row opacity-0 group-hover:opacity-100 transition-opacity duration-[var(--dc-motion-fast)] ease-[var(--dc-ease-out-soft)] ${isAssistant ? "" : "flex-row-reverse"}`}
    >
      <span className={loading ? "hidden" : "flex flex-row gap-3"}>
        {isEditMode ? (
          <>
            <ToolbarIconButton icon="lucide:check" tooltip="Save" onClick={onSave} />
            <ToolbarIconButton icon="lucide:x" tooltip="Cancel" onClick={onCancel} />
          </>
        ) : (
          <>
            {!isAssistant && !isEditMode && !isReadOnly && (
              <ToolbarIconButton icon="lucide:refresh-cw" tooltip="Retry" onClick={onRetry} />
            )}

            <ToolbarIconButton
              icon="lucide:chevron-left"
              tooltip="Previous variant"
              className={isAssistant && hasVariants ? "" : "hidden"}
              disabled={currentVariantIndex === 0}
              onClick={onPrev}
            />

            <span className={isAssistant && hasVariants ? "" : "hidden"}>
              {(currentVariantIndex ?? 0) + 1} / {totalVariants}
            </span>

            <ToolbarIconButton
              icon="lucide:chevron-right"
              tooltip="Next variant"
              className={isAssistant && hasVariants ? "" : "hidden"}
              disabled={(currentVariantIndex ?? 0) >= (totalVariants || 0) - 1}
              onClick={onNext}
            />

            <ToolbarIconButton icon="lucide:copy" tooltip="Copy" className="relative" onClick={handleCopy}>
              {showCopyTip && <span className={TOOLBAR_TIP_CLASS}>Copied</span>}
            </ToolbarIconButton>

            <ToolbarIconButton
              icon={isCapturingImage ? "lucide:loader" : "lucide:images"}
              iconClassName={isCapturingImage ? "w-3 h-3 animate-spin" : "w-3 h-3"}
              tooltip={isCapturingImage ? "Capturing..." : "Copy image (long press for from top)"}
              className="relative"
              disabled={isCapturingImage}
              onMouseDown={handleCopyImageStart}
              onMouseUp={handleCopyImageEnd}
              onMouseLeave={handleCopyImageCancel}
            >
              {showCopyImageTip && <span className={TOOLBAR_TIP_CLASS}>Image copied</span>}
              {showCopyFromTopTip && <span className={TOOLBAR_TIP_CLASS}>Copied from top</span>}
            </ToolbarIconButton>

            {isAssistant && !isReadOnly && (
              <ToolbarIconButton icon="lucide:refresh-cw" tooltip="Retry" onClick={onRetry} />
            )}

            {isAssistant && traceDebugEnabled && allowTrace && (
              <ToolbarIconButton icon="lucide:bug" tooltip="Trace debug" onClick={onTrace} />
            )}

            {isAssistant && !loading && !isInGeneratingThread && !isReadOnly && (
              <ToolbarIconButton icon="lucide:git-branch" tooltip="Fork" onClick={onFork} />
            )}

            {!isAssistant && !isEditMode && !isReadOnly && (
              <ToolbarIconButton icon="lucide:edit" tooltip="Edit" onClick={onEdit} />
            )}

            {!isReadOnly && <ToolbarIconButton icon="lucide:trash-2" tooltip="Delete" onClick={onDelete} />}
          </>
        )}
      </span>

      <MessageUsageStats usage={usage} hasTokensPerSecond={hasTokensPerSecond} />
    </div>
  );
};
