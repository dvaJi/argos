import { type FC, useCallback, useMemo, useRef } from "react";
import { MessageBlockAction } from "#/components/message/MessageBlockAction";
import { useMessageCapture } from "#/composables/message/useMessageCapture";
import { useThemeStore } from "#/stores/theme";
import { type DisplayAssistantMessageBlock, type DisplayMessage, type MessageListItem } from "./messageListItems";
import MessageListRow from "./MessageListRow";

interface MessageListProps {
  messages: MessageListItem[];
  conversationId?: string;
  ephemeralRateLimitBlock?: DisplayAssistantMessageBlock | null;
  ephemeralRateLimitMessageId?: string | null;
  isGenerating?: boolean;
  traceMessageIds?: string[];
  isReadOnly?: boolean;
  onRetry: (messageId: string) => void;
  onDelete: (messageId: string) => void;
  onFork: (messageId: string) => void;
  onContinue: (conversationId: string, messageId: string) => void;
  onTrace: (messageId: string) => void;
  onEditSave: (payload: { messageId: string; text: string }) => void;
  onMeasure: (payload: { messageId: string; height: number }) => void;
}

const MessageList: FC<MessageListProps> = ({
  messages,
  conversationId = "",
  ephemeralRateLimitBlock = null,
  ephemeralRateLimitMessageId = null,
  isGenerating = false,
  traceMessageIds = [],
  isReadOnly = false,
  onRetry,
  onDelete,
  onFork,
  onContinue,
  onTrace,
  onEditSave,
  onMeasure,
}) => {
  const themeStore = useThemeStore();
  const traceMessageIdSet = useMemo(() => new Set(traceMessageIds), [traceMessageIds]);
  const allRenderedMessages = useMemo(() => messages, [messages]);
  const displayMessages = useMemo(() => allRenderedMessages, [allRenderedMessages]);
  const { isCapturing, captureMessage } = useMessageCapture(themeStore.isDark);
  const captureMessageRef = useRef(captureMessage);
  captureMessageRef.current = captureMessage;

  const resolveCaptureParentId = useCallback(
    (messageId: string, parentId?: string): string | undefined => {
      const messageItems = displayMessages;
      if (parentId) {
        const parentMessage = messageItems.find((msg) => msg.id === parentId);
        if (parentMessage?.role === "user") return parentId;
      }
      const messageIndex = messageItems.findIndex((msg) => msg.id === messageId);
      if (messageIndex <= 0) return undefined;
      for (let index = messageIndex - 1; index >= 0; index -= 1) {
        const candidate = messageItems[index] as DisplayMessage;
        if (candidate.role === "user") return candidate.id;
      }
      return undefined;
    },
    [displayMessages],
  );

  const handleCopyImage = useCallback(
    async (
      messageId: string,
      parentId: string | undefined,
      fromTop: boolean,
      modelInfo: { model_name: string; model_provider: string },
    ) => {
      const resolvedParentId = resolveCaptureParentId(messageId, parentId);
      await captureMessageRef.current({ messageId, parentId: resolvedParentId, fromTop, modelInfo });
    },
    [resolveCaptureParentId],
  );

  return (
    <div data-testid="chat-message-list" className="chat-message-list w-full min-w-0">
      <div className="mx-auto w-full max-w-5xl space-y-1 px-6 py-6">
        {allRenderedMessages.map((item) => (
          <MessageListRow
            key={item.id}
            item={item}
            isGenerating={isGenerating}
            showTrace={traceMessageIdSet.has(item.id)}
            isCapturing={isCapturing}
            isReadOnly={isReadOnly}
            onRetry={onRetry}
            onDelete={onDelete}
            onFork={onFork}
            onContinue={onContinue}
            onTrace={onTrace}
            onEditSave={onEditSave}
            onCopyImage={handleCopyImage}
            onMeasure={onMeasure}
          />
        ))}

        {ephemeralRateLimitBlock && (
          <div data-rate-limit-indicator="true" className="pl-11 pr-11 pt-1">
            <MessageBlockAction
              messageId={ephemeralRateLimitMessageId || "__rate_limit__"}
              conversationId={conversationId}
              block={ephemeralRateLimitBlock}
              isReadOnly={isReadOnly}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageList;
