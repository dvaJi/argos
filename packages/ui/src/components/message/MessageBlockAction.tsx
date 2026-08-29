import { type FC, useState, useEffect, useRef } from "react";
import { useSelector } from "@tanstack/react-store";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import type { DisplayAssistantMessageBlock } from "#/components/chat/messageListItems";
import { uiSettingsStore } from "#/stores/uiSettingsStore";
interface MessageBlockActionProps {
  messageId: string;
  conversationId: string;
  block: DisplayAssistantMessageBlock;
  isReadOnly?: boolean;
  onContinue?: (conversationId: string, messageId: string) => void;
}
export const MessageBlockAction: FC<MessageBlockActionProps> = ({
  messageId,
  conversationId,
  block,
  isReadOnly: isReadOnlyProp,
  onContinue,
}) => {
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const progressTimer = useRef<number | null>(null);
  const isReadOnly = isReadOnlyProp === true;
  const isRateLimitBlock = block.action_type === "rate_limit";
  const isRateLimitActive = isRateLimitBlock && (block.status === "loading" || block.status === "pending");
  const showContinueIndicator = useSelector(uiSettingsStore, (s) => s.showContinueIndicator);
  const elapsedSeconds = (() => {
    if (!isRateLimitBlock) return 0;
    const elapsed = currentTime - block.timestamp;
    return Math.max(0, Math.floor(Math.max(0, elapsed) / 1000));
  })();
  const rateLimitStatusLabel = `Rate limiting ${elapsedSeconds}s`;
  const containerClass = isRateLimitBlock
    ? "my-2"
    : "flex flex-col w-[360px] break-all shadow-sm my-2 items-start p-2 gap-2 rounded-lg border bg-card text-card-foreground";
  const handleClick = () => {
    onContinue?.(conversationId, messageId);
  };
  useEffect(() => {
    if (!isRateLimitActive) return;
    if (Date.now() - block.timestamp > 180_000) return;
    progressTimer.current = window.setInterval(() => {
      setCurrentTime(Date.now());
      if (Date.now() - block.timestamp > 180_000) {
        if (progressTimer.current) {
          clearInterval(progressTimer.current);
          progressTimer.current = null;
        }
      }
    }, 1000);
    return () => {
      if (progressTimer.current) {
        clearInterval(progressTimer.current);
      }
    };
  }, [isRateLimitActive, block.timestamp]);
  const hasContent =
    Boolean(block.extra?.needContinue) ||
    isRateLimitBlock ||
    (!block.extra?.needContinue && block.action_type !== "rate_limit" && showContinueIndicator);
  if (!hasContent) return null;
  return (
    <div className={containerClass}>
      {block.extra?.needContinue ? (
        <>
          <div className="flex flex-row items-center gap-2 w-full">
            <div className="flex flex-row gap-2 items-center">
              <Icon icon="lucide:info" className="w-4 h-4 text-red-500/80" />
            </div>
            <div className="prose prose-sm max-w-full break-all whitespace-pre-wrap leading-7 text-left text-card-foreground">
              {block.content || ""}
            </div>
          </div>
          {block.extra.needContinue && !isReadOnly && (
            <Button className="bg-primary rounded-lg hover:bg-indigo-600/50 h-8" size="sm" onClick={handleClick}>
              <Icon icon="lucide:check" className="w-4 h-4" />
              Continue
            </Button>
          )}
        </>
      ) : isRateLimitBlock ? (
        <div
          data-rate-limit-block="true"
          className="inline-flex items-center gap-[10px] text-xs leading-4 text-[rgba(37,37,37,0.5)] dark:text-white/50"
        >
          <span className="whitespace-nowrap">{rateLimitStatusLabel}</span>
          <Icon
            icon="lucide:ellipsis"
            className="w-[14px] h-[14px] text-[rgba(37,37,37,0.5)] dark:text-white/50 animate-[pulse_1s_ease-in-out_infinite]"
          />
        </div>
      ) : null}

      {!block.extra?.needContinue && block.action_type !== "rate_limit" && showContinueIndicator && (
        <div className="text-xs text-gray-500 flex flex-row gap-2 items-center">
          <Icon icon="lucide:check" className="w-4 h-4" />
          Continued
        </div>
      )}
    </div>
  );
};
