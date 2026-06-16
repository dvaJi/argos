import { type MouseEvent, useState, useMemo, useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import type { DisplayAssistantMessage, DisplayAssistantMessageBlock } from "@/components/chat/messageListItems";
import { MessageBlockContent } from "./MessageBlockContent";
import { MessageBlockThink } from "./MessageBlockThink";
import MessageBlockToolCall from "./MessageBlockToolCall";
import { MessageBlockError } from "./MessageBlockError";
import { MessageBlockQuestionRequest } from "./MessageBlockQuestionRequest";
import { MessageToolbar } from "./MessageToolbar";
import { MessageInfo } from "./MessageInfo";
import { useUiSettingsStore } from "@/stores/uiSettingsStore";
import ModelIcon from "@/components/icons/ModelIcon";
import { Spinner } from "@shadcn/components/ui/spinner";
import { MessageBlockAction } from "./MessageBlockAction";
import { MessageBlockImage } from "./MessageBlockImage";
import { MessageBlockAudio } from "./MessageBlockAudio";
import { MessageBlockVideo } from "./MessageBlockVideo";
import { MessageBlockPlan } from "./MessageBlockPlan";
import { MessageBlockActivityGroup } from "./MessageBlockActivityGroup";
import { buildAssistantRenderItems } from "./messageActivityGroups";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@shadcn/components/ui/dialog";
import { Button } from "@shadcn/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@shadcn/components/ui/context-menu";
import { createDeviceClient } from "@api/DeviceClient";
import { useThemeStore } from "@/stores/theme";

const AUDIO_EXTENSIONS = [".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".opus"];
const VIDEO_EXTENSIONS = [".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"];

const isAudioBlock = (block: DisplayAssistantMessageBlock): boolean => {
  if (block.type === "audio") return true;
  if (block.type !== "image") return false;
  const mimeType = block.image_data?.mimeType?.toLowerCase() || "";
  if (mimeType.startsWith("audio/")) return true;
  const data = block.image_data?.data || "";
  if (data.startsWith("data:audio/")) return true;
  if (data.startsWith("imgcache://") || data.startsWith("http://") || data.startsWith("https://")) {
    const lower = data.toLowerCase();
    return AUDIO_EXTENSIONS.some(lower.includes);
  }
  return false;
};

const isInternalToolCall = (block: DisplayAssistantMessageBlock): boolean =>
  block.tool_call?.name === "update_plan" && block.extra?.internalTool === true;

const isVideoUrl = (value: string): boolean => {
  if (!value) return false;
  try {
    const normalizedUrl = value.startsWith("imgcache://")
      ? new URL(value.replace("imgcache://", "https://imgcache.local/"))
      : new URL(value);
    const pathname = normalizedUrl.pathname.toLowerCase();
    return VIDEO_EXTENSIONS.some(pathname.endsWith);
  } catch {
    const lower = value.toLowerCase();
    return VIDEO_EXTENSIONS.some(
      (ext) => lower.endsWith(ext) || lower.includes(`${ext}?`) || lower.includes(`${ext}#`),
    );
  }
};

const getLegacyBlockData = (block: DisplayAssistantMessageBlock): string => {
  const content = block.content;
  if (content && typeof content === "object" && "data" in content)
    return String((content as { data?: unknown }).data ?? "");
  return typeof content === "string" ? content : "";
};

const isVideoBlock = (block: DisplayAssistantMessageBlock): boolean => {
  if (block.type === "video") return true;
  if (block.type !== "image") return false;
  const mimeType = block.image_data?.mimeType?.toLowerCase() || "";
  if (mimeType.startsWith("video/")) return true;
  const data = block.image_data?.data || getLegacyBlockData(block);
  if (data.startsWith("data:video/")) return true;
  if (data.startsWith("imgcache://") || data.startsWith("http://") || data.startsWith("https://"))
    return isVideoUrl(data);
  return false;
};

type HandleActionType =
  | "retry"
  | "delete"
  | "copy"
  | "prev"
  | "next"
  | "copyImage"
  | "copyImageFromTop"
  | "fork"
  | "trace";

export interface MessageItemAssistantRef {
  handleAction: (action: HandleActionType) => void;
}

interface MessageItemAssistantProps {
  message: DisplayAssistantMessage;
  isCapturingImage: boolean;
  useLegacyActions?: boolean;
  isInGeneratingThread?: boolean;
  showTrace?: boolean;
  isReadOnly?: boolean;
  onCopyImage?: (
    messageId: string,
    parentId: string | undefined,
    fromTop: boolean,
    modelInfo: { model_name: string; model_provider: string },
  ) => void;
  onVariantChanged?: (messageId: string) => void;
  onTrace?: (messageId: string) => void;
  onRetry?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  onFork?: (messageId: string) => void;
  onContinue?: (conversationId: string, messageId: string) => void;
  onSwitchProvider?: () => void;
}

export const MessageItemAssistant = forwardRef<MessageItemAssistantRef, MessageItemAssistantProps>((props, ref) => {
  const {
    message,
    isCapturingImage,
    useLegacyActions: useLegacyActionsProp,
    isInGeneratingThread: isInGeneratingThreadProp,
    showTrace: showTraceProp,
    isReadOnly: isReadOnlyProp,
  } = props;

  const themeStore = useThemeStore();
  const deviceClient = createDeviceClient();
  const uiSettingsStore = useUiSettingsStore();

  const useLegacyActions = useLegacyActionsProp !== false;
  const resolvedIsInGeneratingThread = isInGeneratingThreadProp ?? false;
  const showTrace = showTraceProp ?? false;
  const isReadOnly = isReadOnlyProp === true;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const [showSelectionMenu, setShowSelectionMenu] = useState(false);
  const [lastSelectionText, setLastSelectionText] = useState("");
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x?: number; y?: number }>({});
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [isForkDialogOpen, setIsForkDialogOpen] = useState(false);

  const currentThreadId = useMemo(() => message.conversationId || "", [message.conversationId]);

  const allVariants = useMemo(() => {
    const messageVariants = message.variants || [];
    const variantsById = new Map<string, DisplayAssistantMessage>();
    messageVariants.forEach((variant) => {
      if (variant.role === "assistant" && variant.is_variant !== 0) variantsById.set(variant.id, variant);
    });
    return Array.from(variantsById.values());
  }, [message.variants]);

  const totalVariants = useMemo(() => allVariants.length + 1, [allVariants]);

  const currentVariantIndex = useMemo(() => {
    if (!useLegacyActions) return 0;
    if (!selectedVariantId) return 0;
    const variantIndex = allVariants.findIndex((v) => v.id === selectedVariantId);
    return variantIndex !== -1 ? variantIndex + 1 : 0;
  }, [useLegacyActions, selectedVariantId, allVariants]);

  const currentMessage = useMemo(() => {
    if (currentVariantIndex === 0) return message;
    return allVariants[currentVariantIndex - 1] || message;
  }, [currentVariantIndex, message, allVariants]);

  const currentContent = useMemo(() => {
    if (currentVariantIndex === 0) return message.content as DisplayAssistantMessageBlock[];
    const variant = allVariants[currentVariantIndex - 1];
    return (variant?.content || message.content) as DisplayAssistantMessageBlock[];
  }, [currentVariantIndex, message, allVariants]);

  const shouldGroupActivity = useMemo(
    () => !resolvedIsInGeneratingThread && currentMessage.status !== "pending",
    [resolvedIsInGeneratingThread, currentMessage.status],
  );

  const currentRenderItems = useMemo(
    () =>
      buildAssistantRenderItems({
        blocks: currentContent,
        messageId: currentMessage.id,
        messageUpdatedAt: currentMessage.updatedAt,
        shouldGroup: shouldGroupActivity,
        isInternalToolCall,
      }),
    [currentContent, currentMessage.id, currentMessage.updatedAt, shouldGroupActivity],
  );

  const isSearchResult = useMemo(
    () => Boolean(currentContent?.some((block) => block.type === "search" && block.status === "success")),
    [currentContent],
  );

  useEffect(() => {
    if (!selectedVariantId) return;
    const exists = allVariants.some((variant) => variant.id === selectedVariantId);
    if (!exists) setSelectedVariantId(null);
  }, [message.id, allVariants]);

  const getSelectionInCurrentMessage = () => {
    const selection = window.getSelection();
    const root = rootRef.current;
    if (!selection || !root || selection.rangeCount === 0 || selection.isCollapsed) return "";
    const text = selection.toString().trim();
    if (!text) return "";
    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return "";
    return text;
  };

  const resolveSelectionText = () => getSelectionInCurrentMessage() || lastSelectionText;

  const handleContextMenuOpen = (event: MouseEvent) => {
    if (useLegacyActions) return;
    setContextMenuPosition({ x: event.clientX, y: event.clientY });
    const text = getSelectionInCurrentMessage();
    setShowSelectionMenu(!!text);
    setLastSelectionText(text);
  };

  const handleSelectionCopy = () => {
    const text = resolveSelectionText();
    if (!text) return;
    deviceClient.copyText(text);
  };

  const handleSelectionTranslate = () => {
    const text = resolveSelectionText();
    if (!text) return;
    window.dispatchEvent(
      new CustomEvent("context-menu-translate-text", {
        detail: { text, x: contextMenuPosition.x, y: contextMenuPosition.y },
      }),
    );
  };

  const handleSelectionAskAI = () => {
    if (isReadOnly) return;
    const text = resolveSelectionText();
    if (!text) return;
    window.dispatchEvent(new CustomEvent("context-menu-ask-ai", { detail: text }));
  };

  const handleBlockContinue = (conversationId: string, messageId: string) => {
    if (isReadOnly) return;
    props.onContinue?.(conversationId, messageId);
  };

  const handleBlockSwitchProvider = () => {
    if (isReadOnly) return;
    props.onSwitchProvider?.();
  };

  const handleCollapseToggle = () => {
    props.onVariantChanged?.(message.id);
  };

  const handleAction = (action: HandleActionType) => {
    if (isReadOnly && (action === "retry" || action === "delete" || action === "fork")) return;

    if (action === "retry") {
      props.onRetry?.(currentMessage.id);
    } else if (action === "delete") {
      props.onDelete?.(currentMessage.id);
    } else if (action === "copy") {
      deviceClient.copyText(
        currentContent
          .filter((block) => {
            if (
              (block.type === "reasoning_content" || block.type === "artifact-thinking") &&
              !uiSettingsStore.copyWithCotEnabled
            )
              return false;
            return true;
          })
          .map((block) => {
            const trimmedContent = (block.content ?? "").trim();
            if (
              (block.type === "reasoning_content" || block.type === "artifact-thinking") &&
              uiSettingsStore.copyWithCotEnabled
            )
              return `<think">\n${trimmedContent}\n</think">`;
            return trimmedContent;
          })
          .join("\n")
          .trim(),
      );
    } else if (action === "prev" || action === "next") {
      if (!useLegacyActions) return;
      let newIndex = currentVariantIndex;
      if (action === "prev" && newIndex > 0) newIndex--;
      else if (action === "next" && newIndex < totalVariants - 1) newIndex++;
      if (newIndex === currentVariantIndex) return;
      setSelectedVariantId(newIndex > 0 ? (allVariants[newIndex - 1]?.id ?? null) : null);
      props.onVariantChanged?.(message.id);
    } else if (action === "copyImage") {
      props.onCopyImage?.(message.id, currentMessage.parentId, false, {
        model_name: currentMessage.model_name,
        model_provider: currentMessage.model_provider,
      });
    } else if (action === "copyImageFromTop") {
      props.onCopyImage?.(message.id, currentMessage.parentId, true, {
        model_name: currentMessage.model_name,
        model_provider: currentMessage.model_provider,
      });
    } else if (action === "fork") {
      if (useLegacyActions) setIsForkDialogOpen(true);
      else props.onFork?.(currentMessage.id);
    } else if (action === "trace") {
      props.onTrace?.(currentMessage.id);
    }
  };

  useImperativeHandle(ref, () => ({ handleAction }));

  const content = (
    <div
      ref={rootRef}
      data-testid="chat-message-assistant"
      data-message-id={message.id}
      className="flex flex-row pl-4 pt-5 pr-11 group gap-2 w-full justify-start assistant-message-item"
      onContextMenu={handleContextMenuOpen}
    >
      <div className="shrink-0 w-5 h-5 flex items-center justify-center">
        {currentMessage.model_provider === "acp" ? (
          <ModelIcon modelId={currentMessage.model_id} isDark={themeStore.isDark} customClass="w-[18px] h-[18px]" />
        ) : (
          <ModelIcon
            modelId={currentMessage.model_provider}
            customClass="w-[18px] h-[18px]"
            isDark={themeStore.isDark}
          />
        )}
      </div>

      <div className="flex flex-col w-full space-y-1.5">
        <MessageInfo name={currentMessage.model_name} timestamp={currentMessage.timestamp} />
        {currentContent.length === 0 && (currentMessage?.status ?? message.status) === "pending" ? (
          <Spinner className="size-3 text-muted-foreground" />
        ) : (
          <div className="flex flex-col w-full gap-1.5" data-message-content="true">
            {currentRenderItems.map((item) => {
              if (item.kind === "activity-group") {
                return (
                  <MessageBlockActivityGroup
                    key={item.key}
                    blocks={item.blocks}
                    messageId={currentMessage.id}
                    threadId={currentThreadId}
                    usage={currentMessage.usage}
                    durationMs={item.durationMs}
                    reasoningCount={item.reasoningCount}
                    toolCallCount={item.toolCallCount}
                    onToggleCollapse={handleCollapseToggle}
                  />
                );
              }
              const block = item.block;
              if (block.type === "content") {
                return (
                  <MessageBlockContent
                    key={item.key}
                    block={block}
                    messageId={currentMessage.id}
                    threadId={currentThreadId}
                  />
                );
              }
              if ((block.type === "reasoning_content" || block.type === "artifact-thinking") && block.content) {
                return (
                  <MessageBlockThink
                    key={item.key}
                    block={block}
                    usage={currentMessage.usage}
                    onToggleCollapse={handleCollapseToggle}
                  />
                );
              }
              if (block.type === "plan") return <MessageBlockPlan key={item.key} block={block} />;
              if (block.type === "tool_call" && !isInternalToolCall(block)) {
                return (
                  <MessageBlockToolCall
                    key={item.key}
                    block={block}
                    messageId={currentMessage.id}
                    threadId={currentThreadId}
                  />
                );
              }
              if (block.type === "action" && block.action_type === "question_request") {
                return <MessageBlockQuestionRequest key={item.key} block={block} />;
              }
              if (block.type === "action") {
                return (
                  <MessageBlockAction
                    key={item.key}
                    messageId={currentMessage.id}
                    conversationId={currentThreadId}
                    block={block}
                    isReadOnly={isReadOnly}
                    onContinue={handleBlockContinue}
                  />
                );
              }
              if (isAudioBlock(block))
                return (
                  <MessageBlockAudio
                    key={item.key}
                    block={block}
                    messageId={currentMessage.id}
                    threadId={currentThreadId}
                  />
                );
              if (isVideoBlock(block))
                return (
                  <MessageBlockVideo
                    key={item.key}
                    block={block}
                    messageId={currentMessage.id}
                    threadId={currentThreadId}
                  />
                );
              if (block.type === "image")
                return (
                  <MessageBlockImage
                    key={item.key}
                    block={block}
                    messageId={currentMessage.id}
                    threadId={currentThreadId}
                  />
                );
              if (block.type === "error") return <MessageBlockError key={item.key} block={block} />;
              return null;
            })}
          </div>
        )}
        <MessageToolbar
          loading={message.status === "pending"}
          usage={message.usage}
          isAssistant={true}
          currentVariantIndex={currentVariantIndex}
          totalVariants={totalVariants}
          isInGeneratingThread={resolvedIsInGeneratingThread}
          isCapturingImage={isCapturingImage}
          showTrace={showTrace}
          isReadOnly={isReadOnly}
          onRetry={() => handleAction("retry")}
          onDelete={() => handleAction("delete")}
          onCopy={() => handleAction("copy")}
          onCopyImage={() => handleAction("copyImage")}
          onCopyImageFromTop={() => handleAction("copyImageFromTop")}
          onPrev={() => handleAction("prev")}
          onNext={() => handleAction("next")}
          onFork={() => handleAction("fork")}
          onTrace={() => handleAction("trace")}
        />
      </div>
    </div>
  );

  if (useLegacyActions) {
    return (
      <>
        {content}
        <Dialog open={isForkDialogOpen} onOpenChange={setIsForkDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Fork Conversation</DialogTitle>
              <DialogDescription>Create a new branch from this message?</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsForkDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="default"
                onClick={() => {
                  props.onFork?.(currentMessage.id);
                  setIsForkDialogOpen(false);
                }}
              >
                Confirm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{content}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {showSelectionMenu ? (
          <>
            <ContextMenuItem onSelect={handleSelectionCopy}>Copy</ContextMenuItem>
            <ContextMenuItem onSelect={handleSelectionTranslate}>Translate</ContextMenuItem>
            {!isReadOnly && <ContextMenuItem onSelect={handleSelectionAskAI}>Ask AI</ContextMenuItem>}
          </>
        ) : (
          <>
            <ContextMenuItem onSelect={() => handleAction("copy")}>Copy</ContextMenuItem>
            {!isReadOnly && <ContextMenuItem onSelect={() => handleAction("retry")}>Retry</ContextMenuItem>}
            {!isReadOnly && (
              <ContextMenuItem
                disabled={message.status === "pending" || resolvedIsInGeneratingThread}
                onSelect={() => handleAction("fork")}
              >
                Fork
              </ContextMenuItem>
            )}
            {!isReadOnly && <ContextMenuSeparator />}
            {!isReadOnly && <ContextMenuItem onSelect={() => handleAction("delete")}>Delete</ContextMenuItem>}
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
});

MessageItemAssistant.displayName = "MessageItemAssistant";

export default MessageItemAssistant;
