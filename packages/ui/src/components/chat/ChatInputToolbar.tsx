import { type FC } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "#shadcn/components/ui/tooltip";
interface ChatInputToolbarProps {
  isGenerating?: boolean;
  isCancelling?: boolean;
  /** Text or attachments are present; drives the steer button visibility. */
  hasInput?: boolean;
  sendDisabled?: boolean;
  /**
   * True while the chat composer is dispatching a message. The primary
   * button label switches to "Sending…" so the user knows the click
   * registered, even if the network round-trip is fast.
   */
  isSending?: boolean;
  queueDisabled?: boolean;
  onSend: () => void;
  /** Only reachable while generating (primary button becomes "Queue"). */
  onQueue?: () => void;
  /** Only reachable while generating with input (steer button). */
  onSteer?: () => void;
  /** Only reachable while generating without input (stop button). */
  onStop?: () => void;
}

/**
 * Right-hand action cluster of the thread composer: steer (while generating
 * with input) and the primary send / queue / stop button. The attach button
 * lives in the composer's footer-left cluster (`ThreadComposer`).
 */
const ChatInputToolbar: FC<ChatInputToolbarProps> = ({
  isGenerating = false,
  isCancelling = false,
  hasInput = false,
  sendDisabled = false,
  isSending = false,
  queueDisabled = false,
  onSend,
  onQueue,
  onSteer,
  onStop,
}) => {
  const buttonMode = (() => {
    if (isGenerating && !hasInput) return "stop";
    if (isGenerating) return "queue";
    return "send";
  })();
  const primaryTooltip = (() => {
    if (buttonMode === "stop") return isCancelling ? "Cancelling…" : "Stop";
    if (buttonMode === "queue") return "Queue";
    if (isSending) return "Sending…";
    return "Send";
  })();
  const handlePrimaryAction = () => {
    if (buttonMode === "stop") {
      onStop?.();
      return;
    }
    if (buttonMode === "queue") {
      onQueue?.();
      return;
    }
    onSend();
  };
  return (
    <div className="flex items-center gap-1">
      {isGenerating && hasInput && (
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
            <p>Interrupt &amp; send as next turn</p>
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
              isSending
                ? "lucide:loader-circle"
                : buttonMode === "stop"
                  ? isCancelling
                    ? "lucide:loader-circle"
                    : "lucide:square"
                  : buttonMode === "queue"
                    ? "lucide:list-plus"
                    : "lucide:arrow-up"
            }
            className={
              isSending
                ? "w-4 h-4 text-muted-foreground motion-safe:animate-spin"
                : buttonMode === "stop"
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
  );
};
export default ChatInputToolbar;
