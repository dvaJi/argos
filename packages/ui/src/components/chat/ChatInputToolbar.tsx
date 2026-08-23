import { type FC, useMemo } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "#shadcn/components/ui/tooltip";

interface ChatInputToolbarProps {
  isGenerating?: boolean;
  isCancelling?: boolean;
  hasInput?: boolean;
  hasText?: boolean;
  sendDisabled?: boolean;
  queueDisabled?: boolean;
  showVoiceInput?: boolean;
  isVoiceInputListening?: boolean;
  isVoiceInputTranscribing?: boolean;
  compact?: boolean;
  onSend: () => void;
  onQueue: () => void;
  onSteer: () => void;
  onAttach: () => void;
  onVoiceInput: () => void;
  onStop: () => void;
}

const ChatInputToolbar: FC<ChatInputToolbarProps> = ({
  isGenerating = false,
  isCancelling = false,
  hasInput = false,
  hasText = false,
  sendDisabled = false,
  queueDisabled = false,
  showVoiceInput = false,
  isVoiceInputListening = false,
  isVoiceInputTranscribing = false,
  compact = false,
  onSend,
  onQueue,
  onSteer,
  onAttach,
  onVoiceInput,
  onStop,
}) => {
  const hasActiveInput = useMemo(() => hasInput || hasText, [hasInput, hasText]);

  const voiceInputButtonClass = useMemo(() => {
    if (isVoiceInputListening) {
      return "relative group h-7 w-7 rounded-lg overflow-hidden text-cyan-600 bg-cyan-500/10 ring-1 ring-cyan-500/30 hover:text-red-500 hover:bg-red-500/10 hover:ring-red-500/35 transition-colors duration-200";
    }
    if (isVoiceInputTranscribing) {
      return "relative group h-7 w-7 rounded-lg text-primary bg-primary/10 ring-1 ring-primary/20 hover:bg-primary/15";
    }
    return "relative group h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground";
  }, [isVoiceInputListening, isVoiceInputTranscribing]);

  const voiceInputIcon = useMemo(() => {
    return isVoiceInputTranscribing ? "lucide:loader-circle" : "lucide:mic";
  }, [isVoiceInputTranscribing]);

  const voiceInputIconClass = useMemo(
    () => `relative z-10 w-4 h-4 ${isVoiceInputTranscribing ? "animate-spin" : ""}`,
    [isVoiceInputTranscribing],
  );

  const voiceInputTooltip = useMemo(() => {
    if (isVoiceInputTranscribing) return "Stop";
    if (isVoiceInputListening) return "Stop voice input";
    return "Voice input";
  }, [isVoiceInputTranscribing, isVoiceInputListening]);

  const buttonMode = useMemo<"send" | "queue" | "stop">(() => {
    if (isGenerating && !hasActiveInput) return "stop";
    if (isGenerating) return "queue";
    return "send";
  }, [isGenerating, hasActiveInput]);

  const primaryTooltip = useMemo(() => {
    if (buttonMode === "stop") return isCancelling ? "Cancelling…" : "Stop";
    if (buttonMode === "queue") return "Queue";
    return "Send";
  }, [buttonMode, isCancelling]);

  const handlePrimaryAction = () => {
    if (buttonMode === "stop") {
      onStop();
      return;
    }
    if (buttonMode === "queue") {
      onQueue();
      return;
    }
    onSend();
  };

  return (
    <div className={compact ? "flex items-center gap-1" : "flex items-center justify-between px-3 py-2"}>
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground"
                onClick={onAttach}
              />
            }
          >
            <Icon icon="lucide:plus" className="w-4 h-4" />
          </TooltipTrigger>
          <TooltipContent>
            <p>Attach file</p>
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="flex items-center gap-1">
        {showVoiceInput && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  data-testid="chat-voice-input-button"
                  variant="ghost"
                  size="icon"
                  className={voiceInputButtonClass}
                  aria-pressed={isVoiceInputListening || isVoiceInputTranscribing}
                  aria-busy={isVoiceInputTranscribing || undefined}
                  onClick={onVoiceInput}
                />
              }
            >
              {isVoiceInputListening && (
                <span aria-hidden="true" className="absolute inset-0 rounded-lg bg-cyan-500/14 animate-pulse" />
              )}
              {isVoiceInputListening ? (
                <Icon
                  icon="lucide:square"
                  className="absolute inset-0 m-auto z-10 hidden w-4 h-4 text-red-500 group-hover:block"
                />
              ) : (
                <Icon icon={voiceInputIcon} className={voiceInputIconClass} />
              )}
            </TooltipTrigger>
            <TooltipContent>
              <p>{voiceInputTooltip}</p>
            </TooltipContent>
          </Tooltip>
        )}

        {isGenerating && hasActiveInput && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  data-testid="chat-steer-button"
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 gap-1 rounded-lg border-border/60 px-2.5 text-[13px] text-foreground"
                  onClick={onSteer}
                />
              }
            >
              <Icon icon="lucide:compass" className="w-3.5 h-3.5" />
              <span>Steer</span>
            </TooltipTrigger>
            <TooltipContent>
              <p>Interrupt & send as next turn</p>
            </TooltipContent>
          </Tooltip>
        )}

        <Tooltip key={buttonMode}>
          <TooltipTrigger
            render={
              <Button
                data-testid={
                  buttonMode === "stop"
                    ? isCancelling
                      ? "chat-cancelling-button"
                      : "chat-stop-button"
                    : buttonMode === "queue"
                      ? "chat-queue-button"
                      : "chat-send-button"
                }
                data-mode={buttonMode}
                data-cancelling={buttonMode === "stop" && isCancelling ? "true" : undefined}
                variant={buttonMode === "stop" ? "outline" : "default"}
                size="icon"
                className="h-7 w-7 rounded-full"
                disabled={buttonMode === "send" ? sendDisabled : buttonMode === "queue" ? queueDisabled : isCancelling}
                onClick={handlePrimaryAction}
              />
            }
          >
            <Icon
              icon={
                buttonMode === "stop"
                  ? isCancelling
                    ? "lucide:loader-circle"
                    : "lucide:square"
                  : buttonMode === "queue"
                    ? "lucide:list-plus"
                    : "lucide:arrow-up"
              }
              className={
                buttonMode === "stop"
                  ? isCancelling
                    ? "w-4 h-4 text-muted-foreground animate-spin"
                    : "w-4 h-4 text-red-500"
                  : "w-4 h-4"
              }
            />
          </TooltipTrigger>
          <TooltipContent>
            <p>{primaryTooltip}</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
};

export default ChatInputToolbar;
