import { useEffect, useEffectEvent, useRef, useState, type RefObject } from "react";
import { useStore } from "@tanstack/react-store";
import ChatTopBar from "#/components/chat/ChatTopBar";
import ChatSearchBar from "#/components/chat/ChatSearchBar";

// Process-wide singletons; module scope keeps hook/effect dependencies stable.
const chatClient = createChatClient();
const sessionClient = createSessionClient();
import MessageList from "#/components/chat/MessageList";
import type {
  DisplayAssistantMessageBlock,
  DisplayMessage,
  DisplayMessageUsage,
} from "#/components/chat/messageListItems";
import { ErrorBoundary } from "#/components/ErrorBoundary";
import SettledBanner from "#/components/threads/SettledBanner";
import AgentProgressFloat from "#/components/chat/AgentProgressFloat";
import PendingInputLane from "#/components/chat/PendingInputLane";
import ChatStatusBar from "#/components/chat/ChatStatusBar";
import ChatToolInteractionOverlay from "#/components/chat/ChatToolInteractionOverlay";
import TraceDialog from "#/components/trace/TraceDialog";
import { useToast } from "#/components/use-toast";
import { createChatClient } from "../../api/ChatClient";
import { useUiSettingsStore } from "#/stores/uiSettingsStore";
import { sessionStore, fetchSessions, selectSession, applyRestoredSession } from "#/stores/ui/session";
import { unsettleSession } from "#/stores/ui/threadSidebar";
import { useMessageStore, addOptimisticUserMessage } from "#/stores/ui/message";
import { agentPlanStore } from "#/stores/ui/agentPlan";
import { agentStore } from "#/stores/ui/agent";
import { streamStateStore } from "#/stores/ui/stream";
import {
  isAtCapacity,
  queueItems as getQueueItems,
  queueInput,
  updateQueueInput,
  moveQueueInput,
  deleteInput as deleteQueueInput,
  steerPendingInput,
  loadPendingInputs,
  steerItems as getSteerItems,
  clear as clearPendingInputStore,
} from "#/stores/ui/pendingInput";
import {
  isCollapsed,
  setCollapsed,
  clear as clearPlanSnapshot,
  toggleCollapsed,
  applySnapshot,
} from "#/stores/ui/agentPlan";
import { useSpotlightStore } from "#/stores/ui/spotlight";
import { useModelStore } from "#/stores/modelStore";
import { createSessionClient } from "#api/SessionClient";
import { isManualCompactionCommand } from "#/components/chat/mentions/utils";
import { clearChatSearchHighlights, setActiveChatSearchMatch, type ChatSearchMatch } from "#/lib/chatSearch";
import { scheduleStartupDeferredTask } from "#/lib/startupDeferred";
import { WORKSPACE_EVENTS } from "#/events";
import { useMessageWindow } from "#/composables/message/useMessageWindow";
import { playChatInputHeroFlight } from "#/lib/chatInputHero";
import { useModelAwareAttachments } from "#/composables/chat/useModelAwareAttachments";
import ThreadComposer, { type ThreadComposerHandle } from "#/components/chat/ThreadComposer";
import { useRuntimeConnectionState } from "#/composables/useRuntimeConnectionState";
import type {
  ChatMessageRecord,
  AssistantMessageBlock,
  MessageFile,
  MessageMetadata,
  ToolInteractionResponse,
} from "@argos/shared/types/agent-interface";
interface ChatPageProps {
  sessionId: string;
}
const RATE_LIMIT_STREAM_MESSAGE_PREFIX = "__rate_limit__:";
const INITIAL_MESSAGE_RESTORE_COUNT = 40;
const NEAR_BOTTOM_THRESHOLD = 80;
const TOP_HISTORY_THRESHOLD = 80;
const MESSAGE_JUMP_RETRY_INTERVAL = 80;
const MESSAGE_HIGHLIGHT_DURATION = 2000;
const MAX_MESSAGE_JUMP_RETRIES = 8;
const displayMessageCache = new Map<
  string,
  {
    updatedAt: number;
    content: ChatMessageRecord["content"];
    metadata: ChatMessageRecord["metadata"];
    modelId: string;
    providerId: string;
    status: DisplayMessage["status"];
    message: DisplayMessage;
  }
>();
/** Heals the store binding when the chat route is restored directly (deep link, tab restore, hash navigation). */
function useSessionBindingHeal(sessionId: string) {
  // The page can render session content from the URL while `activeSessionId`
  // was never set, which leaves the composer footer stuck on "Select model"
  // with a dead send button.
  const healedSessionBindingRef = useRef<string | null>(null);
  useEffect(() => {
    if (!sessionId) return;
    if (sessionStore.state.activeSessionId === sessionId) return;
    if (healedSessionBindingRef.current === sessionId) return;
    healedSessionBindingRef.current = sessionId;
    void selectSession(sessionId).catch(() => {});
  }, [sessionId]);
}
/** A session change or a generation boundary must not carry over the previous session's cancelling state. */
function useSessionCancellingState(sessionId: string, isGenerating: boolean) {
  const [isCancelling, setIsCancelling] = useState(false);
  // Adjust during render instead of in an effect.
  const [cancelReset, setCancelReset] = useState({
    sessionId,
    isGenerating,
  });
  if (cancelReset.sessionId !== sessionId || cancelReset.isGenerating !== isGenerating) {
    setCancelReset({
      sessionId,
      isGenerating,
    });
    setIsCancelling(false);
  }
  return [isCancelling, setIsCancelling] as const;
}
/** Re-subscribes per session so plan snapshots are filtered by the active session. */
function usePlanSnapshotSubscription(chatClient: ReturnType<typeof createChatClient>, sessionId: string) {
  const cancelPlanUpdatedListenerRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    cancelPlanUpdatedListenerRef.current = chatClient.onPlanUpdated((payload) => {
      if (payload.sessionId === sessionId) {
        applySnapshot(payload);
      }
    });
    return () => {
      cancelPlanUpdatedListenerRef.current?.();
      cancelPlanUpdatedListenerRef.current = null;
    };
  }, [chatClient, sessionId]);
}
/** Installs the page-lifetime window listeners (Ask-AI menu, workspace reference insert, find shortcut). */
function useChatWindowListeners(input: {
  handleContextMenuAskAI: (event: Event) => void;
  handleInsertReferenceRequested: (event: Event) => void;
  handleWindowKeydown: (event: KeyboardEvent) => void;
}) {
  const { handleContextMenuAskAI, handleInsertReferenceRequested, handleWindowKeydown } = input;
  // Effect Events keep the listeners subscribed once for the page lifetime
  // while still seeing the latest session state.
  const onContextMenuAskAI = useEffectEvent(handleContextMenuAskAI);
  const onInsertReferenceRequested = useEffectEvent(handleInsertReferenceRequested);
  const onWindowKeydown = useEffectEvent(handleWindowKeydown);
  useEffect(() => {
    window.addEventListener("context-menu-ask-ai", onContextMenuAskAI);
    window.addEventListener(WORKSPACE_EVENTS.INSERT_REFERENCE_REQUESTED, onInsertReferenceRequested);
    window.addEventListener("keydown", onWindowKeydown);
    return () => {
      window.removeEventListener("context-menu-ask-ai", onContextMenuAskAI);
      window.removeEventListener(WORKSPACE_EVENTS.INSERT_REFERENCE_REQUESTED, onInsertReferenceRequested);
      window.removeEventListener("keydown", onWindowKeydown);
    };
  }, []);
}
/** Plays the composer hero flight on mount and tears down page-scoped timers/observers on unmount. */
function useChatPageLifecycle(input: {
  resolveChatInputBoxElement: () => HTMLElement | null;
  messageSearchRootRef: RefObject<HTMLDivElement | null>;
  spotlightJumpTimerRef: RefObject<number | null>;
  scrollReadFrameRef: RefObject<number | null>;
  cancelSessionRestoreTaskRef: RefObject<(() => void) | null>;
}) {
  const {
    resolveChatInputBoxElement,
    messageSearchRootRef,
    spotlightJumpTimerRef,
    scrollReadFrameRef,
    cancelSessionRestoreTaskRef,
  } = input;
  const anchorRestoreFrameRef = useRef<number | null>(null);
  const planFloatResizeObserverRef = useRef<ResizeObserver | null>(null);
  useEffect(() => {
    Promise.resolve().then(async () => {
      await playChatInputHeroFlight(resolveChatInputBoxElement());
    });
    return () => {
      clearChatSearchHighlights(messageSearchRootRef.current);
      if (spotlightJumpTimerRef.current) {
        window.clearTimeout(spotlightJumpTimerRef.current);
        spotlightJumpTimerRef.current = null;
      }
      if (anchorRestoreFrameRef.current !== null) {
        window.cancelAnimationFrame(anchorRestoreFrameRef.current);
        anchorRestoreFrameRef.current = null;
      }
      if (scrollReadFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollReadFrameRef.current);
        scrollReadFrameRef.current = null;
      }
      cancelSessionRestoreTaskRef.current?.();
      cancelSessionRestoreTaskRef.current = null;
      clearPendingInputStore();
      planFloatResizeObserverRef.current?.disconnect();
      planFloatResizeObserverRef.current = null;
    };
    // The extra deps are stable refs; the effect still re-runs only when the
    // hero-flight target lookup changes.
  }, [
    resolveChatInputBoxElement,
    scrollReadFrameRef,
    messageSearchRootRef,
    spotlightJumpTimerRef,
    anchorRestoreFrameRef,
    cancelSessionRestoreTaskRef,
  ]);
}
/** Model selection for the active session, if fully specified. */
function resolveActiveModelSelection(
  activeSession: import("#/stores/ui/session").UIActiveSessionSummary | null,
): { providerId: string; modelId: string } | null {
  const s = activeSession;
  if (!s?.providerId || !s?.modelId) return null;
  return {
    providerId: s.providerId,
    modelId: s.modelId,
  };
}
/** The chat page: top bar, message list, composer dock, and their orchestration. */
function ChatPage({ sessionId }: ChatPageProps) {
  const uiSettingsStore = useUiSettingsStore();
  const sessionState = useStore(sessionStore);
  const messageStore = useMessageStore();
  const agentPlanStoreState = useStore(agentPlanStore);
  const streamState = useStore(streamStateStore);
  const spotlightStore = useSpotlightStore();
  const modelStore = useModelStore();
  const connectionState = useRuntimeConnectionState();
  const isDaemonConnected = connectionState.connected;

  const activeSession = (sessionState.activeSessionSummary ?? sessionState.bootstrapActiveSession) as
    | import("#/stores/ui/session").UIActiveSessionSummary
    | null;
  const messageSearchRootRef = useRef<HTMLDivElement>(null);
  const bottomScrollAnchorRef = useRef<HTMLDivElement>(null);
  const planFloatLayerRef = useRef<HTMLDivElement>(null);
  const chatInputHeroHostRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<ThreadComposerHandle | null>(null);
  const chatSearchBarRef = useRef<{
    focusInput: () => void;
    selectInput: () => void;
  } | null>(null);

  // Heal the store binding when the chat route is restored directly (deep
  // link, tab restore, hash navigation): the page can render session content
  // from the URL while `activeSessionId` was never set, which leaves the
  // composer footer stuck on "Select model" with a dead send button.
  useSessionBindingHeal(sessionId);
  const sessionTitle = activeSession?.title ?? "New Chat";
  const sessionProject = activeSession?.projectDir ?? "";
  const isReadOnlySession = activeSession?.sessionKind === "subagent";
  const isGenerating = activeSession?.status === "working" || streamState.isStreaming;
  const [planFloatReservedHeight, setPlanFloatReservedHeight] = useState(0);
  const [traceMessageId, setTraceMessageId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<MessageFile[]>([]);
  const [isHandlingInteraction, setIsHandlingInteraction] = useState(false);
  const [isCancelling, setIsCancelling] = useSessionCancellingState(sessionId, isGenerating);
  const isAcpWorkdirMissing = (() => {
    const s = activeSession;
    if (!s || s.providerId !== "acp") return false;
    return !s.projectDir?.trim();
  })();
  const resolveChatInputBoxElement = () =>
    (chatInputHeroHostRef.current?.querySelector('[data-testid="chat-input-box"]') as HTMLElement | null) ?? null;

  const {
    isChatSearchOpen,
    openChatSearch,
    chatSearchQuery,
    setChatSearchQuery,
    chatSearchMatches,
    setChatSearchMatches,
    activeChatSearchIndex,
    setActiveChatSearchIndex,
    closeChatSearch,
  } = useChatSearchState({ messageSearchRootRef });
  const {
    scrollContainerRef,
    scrollModeRef,
    scrollReadFrameRef,
    scrollDomToBottom,
    scrollToBottom,
    schedulePostSubmitScrollToBottom,
    onScroll,
  } = useChatScrollController({
    autoScrollEnabled: uiSettingsStore.autoScrollEnabled,
    canLoadOlderMessages: () => !messageStore.isLoadingHistory && messageStore.hasMoreHistory,
    loadOlderMessages: () => messageStore.loadOlderMessages(),
  });
  const {
    hasInlineStreamingTarget,
    ephemeralRateLimitMessageId,
    ephemeralRateLimitBlock,
    latestPlanSnapshot,
    isPlanFloatCollapsed,
    messageSearchRootStyle,
    traceMessageIds,
  } = deriveChatPageViewState({
    streamState,
    messageStore,
    agentPlanStoreState,
    sessionId,
    planFloatReservedHeight,
  });
  const pendingInteractions = collectPendingInteractions(sessionId, messageStore);
  const activePendingInteraction = pendingInteractions[0] ?? null;
  const hasInputText = Boolean(message.trim());
  const hasAttachments = attachedFiles.length > 0;
  const hasDraftInput = hasInputText || hasAttachments;
  const { isQueueSubmitDisabled, isInputSubmitDisabled } = computeChatSubmitFlags({
    isAcpWorkdirMissing,
    hasDraftInput,
    hasActivePendingInteraction: Boolean(activePendingInteraction),
    isHandlingInteraction,
    isDaemonConnected,
    isGenerating,
  });
  const getActiveModelSelection = () => resolveActiveModelSelection(activeSession);
  const { prepareFiles: prepareFilesForCurrentModel, handleFilesChange: filterAttachmentFiles } =
    useModelAwareAttachments(getActiveModelSelection);
  const {
    onSubmit,
    onCommandSubmit,
    onQueueSubmit,
    onSteer,
    onToolInteractionRespond,
    onStop,
    onMessageRetry,
    onMessageDelete,
    onMessageEditSave,
    onMessageFork,
    onMessageContinue,
    onMessageTrace,
    onPendingInputUpdate,
    onPendingInputMove,
    onPendingInputDelete,
    onSteerPendingInput,
  } = useChatActions({
    sessionId,
    activeSession,
    isGenerating,
    isReadOnlySession,
    isAcpWorkdirMissing,
    isDaemonConnected,
    message,
    attachedFiles,
    setMessage,
    setAttachedFiles,
    chatInputRef,
    chatClient,
    sessionClient,
    messageStore,
    prepareFilesForCurrentModel,
    activePendingInteraction,
    isHandlingInteraction,
    setIsHandlingInteraction,
    isCancelling,
    setIsCancelling,
    setTraceMessageId,
    schedulePostSubmitScrollToBottom,
  });
  const onFilesChange = (files: MessageFile[]) => {
    void filterAttachmentFiles(files, setAttachedFiles);
  };
  const onDismissPlanFloat = () => {
    setCollapsed(sessionId, true);
    clearPlanSnapshot(sessionId);
    setPlanFloatReservedHeight(0);
  };
  const { handleContextMenuAskAI, handleWorkspaceInsertReferenceRequested, handleWindowKeydown } =
    useChatWindowEventHandlers({
      sessionId,
      isReadOnlySession,
      setMessage,
      chatInputRef,
      openChatSearch,
      chatSearchBarRef,
    });
  const spotlightJumpTimerRef = useRef<number | null>(null);
  const cancelSessionRestoreTaskRef = useRef<(() => void) | null>(null);
  useChatSessionRestore({
    sessionId,
    messageStore,
    spotlightStore,
    messageSearchRootRef,
    spotlightJumpTimerRef,
    cancelSessionRestoreTaskRef,
    scrollDomToBottom,
  });
  useChatWindowListeners({
    handleContextMenuAskAI,
    handleInsertReferenceRequested: handleWorkspaceInsertReferenceRequested,
    handleWindowKeydown,
  });
  usePlanSnapshotSubscription(chatClient, sessionId);
  useChatPageLifecycle({
    resolveChatInputBoxElement,
    messageSearchRootRef,
    spotlightJumpTimerRef,
    scrollReadFrameRef,
    cancelSessionRestoreTaskRef,
  });
  const { displayMessages, onMessageMeasure } = useChatDisplayMessages({
    streamState,
    messageStore,
    modelStore,
    activeSession,
    sessionId,
    hasInlineStreamingTarget,
    ephemeralRateLimitBlock,
    scrollModeRef,
    scrollToBottom,
  });
  return (
    <div
      ref={scrollContainerRef}
      data-testid="chat-page"
      data-generating={String(isGenerating)}
      className="message-list-container h-full w-full min-w-0 overflow-y-auto"
      onScroll={onScroll}
    >
      <ChatTopBar
        key={sessionId}
        className="chat-capture-hide"
        sessionId={sessionId}
        title={sessionTitle}
        project={sessionProject}
        isReadOnly={isReadOnlySession}
      />
      {isChatSearchOpen && (
        <ChatSearchOverlay
          barRef={chatSearchBarRef}
          query={chatSearchQuery}
          onQueryChange={setChatSearchQuery}
          matches={chatSearchMatches}
          activeMatchIndex={activeChatSearchIndex}
          onActiveMatchIndexChange={setActiveChatSearchIndex}
          onClose={closeChatSearch}
        />
      )}
      <div ref={messageSearchRootRef} className="min-h-[calc(100%-242px)]" style={messageSearchRootStyle}>
        {messageStore.isLoadingHistory && (
          <div className="pointer-events-none px-6 py-2 text-center text-xs text-muted-foreground">Loading...</div>
        )}
        <MessageList
          messages={displayMessages}
          conversationId={sessionId}
          ephemeralRateLimitBlock={ephemeralRateLimitBlock}
          ephemeralRateLimitMessageId={ephemeralRateLimitMessageId}
          isGenerating={isGenerating}
          traceMessageIds={traceMessageIds}
          isReadOnly={isReadOnlySession}
          onRetry={onMessageRetry}
          onDelete={onMessageDelete}
          onFork={onMessageFork}
          onContinue={onMessageContinue}
          onTrace={onMessageTrace}
          onEditSave={onMessageEditSave}
          onMeasure={onMessageMeasure}
        />
        <div ref={bottomScrollAnchorRef} className="h-px w-full" aria-hidden="true" />
      </div>
      <TraceDialog messageId={traceMessageId} sessionId={sessionId} onClose={() => setTraceMessageId(null)} />

      {!isReadOnlySession && (
        <ChatComposerDock
          sessionId={sessionId}
          isGenerating={isGenerating}
          latestPlanSnapshot={latestPlanSnapshot}
          isPlanFloatCollapsed={isPlanFloatCollapsed}
          activePendingInteraction={activePendingInteraction}
          isHandlingInteraction={isHandlingInteraction}
          onDismissPlanFloat={onDismissPlanFloat}
          onTogglePlanCollapse={() => toggleCollapsed(sessionId)}
          onToolInteractionRespond={onToolInteractionRespond}
          onDeleteQueue={onPendingInputDelete}
          onSteerQueueItem={onSteerPendingInput}
          heroHostRef={chatInputHeroHostRef}
          planFloatLayerRef={planFloatLayerRef}
          chatInputRef={chatInputRef}
          message={message}
          onMessageChange={setMessage}
          attachedFiles={attachedFiles}
          onFilesChange={onFilesChange}
          workspacePath={activeSession?.projectDir ?? null}
          isAcpSession={activeSession?.providerId === "acp"}
          isCancelling={isCancelling}
          submitDisabled={isInputSubmitDisabled}
          sendDisabled={isInputSubmitDisabled}
          queueDisabled={isQueueSubmitDisabled}
          onQueueSubmit={onQueueSubmit}
          onSteer={onSteer}
          onStop={onStop}
          onCommandSubmit={onCommandSubmit}
          onSubmit={() => void onSubmit()}
        />
      )}
    </div>
  );
}
type PendingInteractionView = {
  sessionId: string;
  messageId: string;
  toolCallId: string;
  actionType: "question_request" | "tool_call_permission";
  toolName: string;
  toolArgs: string;
  block: DisplayAssistantMessageBlock;
};
type SubagentProgressPayload = {
  tasks?: Array<{
    sessionId?: string | null;
    waitingInteraction?: {
      type: "permission" | "question";
      messageId: string;
      toolCallId: string;
      actionBlock: DisplayAssistantMessageBlock;
    } | null;
  }>;
};
function parseSubagentProgress(value: unknown): SubagentProgressPayload | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as SubagentProgressPayload;
    return Array.isArray(parsed?.tasks) ? parsed : null;
  } catch {
    return null;
  }
}
/** Walks assistant blocks (incl. subagent orchestrator tasks) for pending tool interactions. */
function collectPendingInteractions(
  sessionId: string,
  messageStore: ReturnType<typeof useMessageStore>,
): PendingInteractionView[] {
  const list: PendingInteractionView[] = [];
  for (const message of messageStore.getMessages()) {
    if (message.role !== "assistant") continue;
    const blocks = messageStore.getAssistantMessageBlocks(message);
    for (const block of blocks) {
      if (
        block.type !== "action" ||
        (block.action_type !== "question_request" && block.action_type !== "tool_call_permission") ||
        block.status !== "pending" ||
        block.extra?.needsUserAction === false
      )
        continue;
      const toolCallId = block.tool_call?.id;
      if (!toolCallId) continue;
      const toolCall = block.tool_call;
      list.push({
        sessionId,
        messageId: message.id,
        toolCallId,
        actionType: block.action_type,
        toolName: toolCall?.name || "",
        toolArgs: toolCall?.params || "",
        block,
      });
    }
    for (const block of blocks) {
      if (block.type !== "tool_call" || block.tool_call?.name !== "subagent_orchestrator") continue;
      const progress = parseSubagentProgress(block.extra?.subagentProgress);
      if (!progress?.tasks?.length) continue;
      for (const task of progress.tasks) {
        const waiting = task.waitingInteraction;
        if (!waiting?.actionBlock || !task.sessionId) continue;
        list.push({
          sessionId: task.sessionId,
          messageId: waiting.messageId,
          toolCallId: waiting.toolCallId,
          actionType: waiting.type === "question" ? "question_request" : "tool_call_permission",
          toolName: waiting.actionBlock.tool_call?.name || block.tool_call?.name || "",
          toolArgs: waiting.actionBlock.tool_call?.params || "",
          block: waiting.actionBlock,
        });
      }
    }
  }
  return list;
}
/** Derives stream/plan/search-layout view state for the chat page (pure over snapshots). */
function deriveChatPageViewState(input: {
  streamState: typeof streamStateStore.state;
  messageStore: ReturnType<typeof useMessageStore>;
  agentPlanStoreState: typeof agentPlanStore.state;
  sessionId: string;
  planFloatReservedHeight: number;
}) {
  const { streamState, messageStore, agentPlanStoreState, sessionId, planFloatReservedHeight } = input;
  const hasInlineStreamingTarget = streamState.currentStreamMessageId
    ? messageStore.messageIds.includes(streamState.currentStreamMessageId)
    : false;
  const ephemeralRateLimitMessageId = (() => {
    const messageId = streamState.currentStreamMessageId;
    if (!streamState.isStreaming || !messageId || !messageId.startsWith(RATE_LIMIT_STREAM_MESSAGE_PREFIX)) return null;
    return messageId;
  })();
  const ephemeralRateLimitBlock = (() => {
    if (!ephemeralRateLimitMessageId || streamState.streamingBlocks.length === 0) return null;
    const [firstBlock] = streamState.streamingBlocks as DisplayAssistantMessageBlock[];
    if (
      streamState.streamingBlocks.length !== 1 ||
      firstBlock?.type !== "action" ||
      firstBlock.action_type !== "rate_limit"
    )
      return null;
    return firstBlock;
  })();
  const latestPlanSnapshot = (() => {
    const snapshot = agentPlanStoreState.snapshots[sessionId];
    if (!snapshot || snapshot.plan.length === 0) return null;
    return snapshot;
  })();
  const isPlanFloatCollapsed = isCollapsed(sessionId);
  const messageSearchRootStyle = (() => {
    if (planFloatReservedHeight <= 0) return undefined;
    return {
      paddingBottom: `${planFloatReservedHeight}px`,
    };
  })();
  const traceMessageIds = messageStore
    .getMessages()
    .flatMap((msg) => (msg.role === "assistant" && (msg.traceCount ?? 0) > 0 ? [msg.id] : []));
  return {
    hasInlineStreamingTarget,
    ephemeralRateLimitMessageId,
    ephemeralRateLimitBlock,
    latestPlanSnapshot,
    isPlanFloatCollapsed,
    messageSearchRootStyle,
    traceMessageIds,
  };
}
/** Composer send/queue/steer availability (pure). */
function computeChatSubmitFlags(input: {
  isAcpWorkdirMissing: boolean;
  hasDraftInput: boolean;
  hasActivePendingInteraction: boolean;
  isHandlingInteraction: boolean;
  isDaemonConnected: boolean;
  isGenerating: boolean;
}) {
  const {
    isAcpWorkdirMissing,
    hasDraftInput,
    hasActivePendingInteraction,
    isHandlingInteraction,
    isDaemonConnected,
    isGenerating,
  } = input;
  const isQueueSubmitDisabled =
    isAcpWorkdirMissing || !hasDraftInput || hasActivePendingInteraction || isHandlingInteraction || isAtCapacity();
  const isInputSubmitDisabled =
    isAcpWorkdirMissing ||
    !isDaemonConnected ||
    hasActivePendingInteraction ||
    isHandlingInteraction ||
    (isGenerating && isAtCapacity()) ||
    !hasDraftInput;
  return { isQueueSubmitDisabled, isInputSubmitDisabled };
}
function resolveAssistantModelName(modelId: string, modelStore: ReturnType<typeof useModelStore>): string {
  if (!modelId) return "Assistant";
  const found = modelStore.findModelByIdOrName(modelId);
  if (found?.model?.name) return found.model.name;
  const agent = agentStore.state.agents.find((a) => a.id === modelId);
  if (agent?.name) return agent.name;
  return modelId;
}
function buildUsage(metadata: MessageMetadata): DisplayMessageUsage {
  return {
    context_usage: 0,
    tokens_per_second: metadata.tokensPerSecond ?? 0,
    total_tokens: metadata.totalTokens ?? 0,
    generation_time: metadata.generationTime ?? 0,
    first_token_time: metadata.firstTokenTime ?? 0,
    reasoning_start_time: metadata.reasoningStartTime ?? 0,
    reasoning_end_time: metadata.reasoningEndTime ?? 0,
    input_tokens: metadata.inputTokens ?? 0,
    output_tokens: metadata.outputTokens ?? 0,
  };
}
type DisplayMessageContext = {
  messageStore: ReturnType<typeof useMessageStore>;
  modelStore: ReturnType<typeof useModelStore>;
  activeSession: import("#/stores/ui/session").UIActiveSessionSummary | null;
  sessionId: string;
};
function toDisplayMessage(record: ChatMessageRecord, ctx: DisplayMessageContext): DisplayMessage {
  const { messageStore, modelStore, activeSession } = ctx;
  const metadata = messageStore.getMessageMetadata(record);
  const modelId = metadata.model || activeSession?.modelId || "";
  const providerId = metadata.provider || activeSession?.providerId || "";
  const cached = displayMessageCache.get(record.id);
  if (
    cached &&
    cached.updatedAt === record.updatedAt &&
    cached.content === record.content &&
    cached.metadata === record.metadata &&
    cached.modelId === modelId &&
    cached.providerId === providerId &&
    cached.status === record.status
  ) {
    return cached.message;
  }
  const modelName = record.role === "assistant" ? resolveAssistantModelName(modelId, modelStore) : "";
  const nextMessage =
    record.role === "assistant"
      ? {
          id: record.id,
          timestamp: record.createdAt,
          updatedAt: record.updatedAt,
          avatar: "",
          name: "Assistant",
          model_name: modelName,
          model_id: modelId,
          model_provider: providerId,
          status: record.status,
          error: "",
          usage: buildUsage(metadata),
          conversationId: record.sessionId,
          is_variant: 0,
          orderSeq: record.orderSeq,
          messageType: metadata.messageType === "compaction" ? ("compaction" as const) : undefined,
          compactionStatus: metadata.compactionStatus,
          summaryUpdatedAt: metadata.summaryUpdatedAt ?? null,
          role: "assistant" as const,
          content: messageStore.getAssistantMessageBlocks(record),
        }
      : {
          id: record.id,
          timestamp: record.createdAt,
          updatedAt: record.updatedAt,
          avatar: "",
          name: "You",
          model_name: modelName,
          model_id: modelId,
          model_provider: providerId,
          status: record.status,
          error: "",
          usage: buildUsage(metadata),
          conversationId: record.sessionId,
          is_variant: 0,
          orderSeq: record.orderSeq,
          messageType: metadata.messageType === "compaction" ? ("compaction" as const) : undefined,
          compactionStatus: metadata.compactionStatus,
          summaryUpdatedAt: metadata.summaryUpdatedAt ?? null,
          role: "user" as const,
          content: messageStore.getUserMessageContent(record),
        };
  displayMessageCache.set(record.id, {
    updatedAt: record.updatedAt,
    content: record.content,
    metadata: record.metadata,
    modelId,
    providerId,
    status: record.status,
    message: nextMessage,
  });
  return nextMessage;
}
function toStreamingMessage(
  blocks: AssistantMessageBlock[],
  messageId: string | null,
  now: number,
  ctx: DisplayMessageContext,
): DisplayMessage {
  const { activeSession, sessionId } = ctx;
  const modelId = activeSession?.modelId ?? "";
  return {
    id: messageId ?? "__streaming__",
    content: blocks as DisplayAssistantMessageBlock[],
    role: "assistant",
    timestamp: now,
    updatedAt: now,
    avatar: "",
    name: "Assistant",
    model_name: resolveAssistantModelName(modelId, ctx.modelStore),
    model_id: modelId,
    model_provider: activeSession?.providerId ?? "",
    status: "pending",
    error: "",
    usage: buildUsage({}),
    conversationId: sessionId,
    is_variant: 0,
    orderSeq: Number.MAX_SAFE_INTEGER,
  };
}
/** Scroll position tracking, auto-follow, and history paging for the chat page. */
function useChatScrollController(input: {
  autoScrollEnabled: boolean;
  canLoadOlderMessages: () => boolean;
  loadOlderMessages: () => Promise<number>;
}) {
  const { autoScrollEnabled, canLoadOlderMessages, loadOlderMessages } = input;
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollModeRef = useRef<"initial-bottom" | "auto-follow" | "anchored-reading" | "manual-jump">("initial-bottom");
  const shouldAutoFollowRef = useRef(true);
  const programmaticScrollUntilRef = useRef(0);
  const scrollReadFrameRef = useRef<number | null>(null);
  const pendingUserScrollMetricsRef = useRef(false);
  const markProgrammaticScroll = (durationMs = 300) => {
    programmaticScrollUntilRef.current = Math.max(programmaticScrollUntilRef.current, Date.now() + durationMs);
  };
  const isProgrammaticScrollActive = () => Date.now() < programmaticScrollUntilRef.current;
  const scrollDomToBottom = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTop = Math.max(el.scrollHeight - el.clientHeight, 0);
  };
  const scheduleScrollMetricsRead = (fromUserScroll = false) => {
    if (fromUserScroll) pendingUserScrollMetricsRef.current = true;
    if (scrollReadFrameRef.current !== null) return;
    scrollReadFrameRef.current = window.requestAnimationFrame(() => {
      scrollReadFrameRef.current = null;
      const userInitiated = pendingUserScrollMetricsRef.current;
      pendingUserScrollMetricsRef.current = false;
      const el = scrollContainerRef.current;
      if (!el) return;
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (isProgrammaticScrollActive()) {
        if (userInitiated && distanceFromBottom > NEAR_BOTTOM_THRESHOLD) {
          programmaticScrollUntilRef.current = 0;
          scrollModeRef.current = "anchored-reading";
          shouldAutoFollowRef.current = false;
        }
        return;
      }
      if (userInitiated && scrollModeRef.current !== "manual-jump") {
        const nearBottom = distanceFromBottom <= NEAR_BOTTOM_THRESHOLD;
        shouldAutoFollowRef.current = nearBottom;
        scrollModeRef.current = autoScrollEnabled && nearBottom ? "auto-follow" : "anchored-reading";
      }
    });
  };
  const scrollToBottom = (force = false) => {
    if (force) {
      markProgrammaticScroll(500);
      scrollModeRef.current = "initial-bottom";
      shouldAutoFollowRef.current = true;
    } else if (!autoScrollEnabled || !shouldAutoFollowRef.current) {
      return;
    }
    Promise.resolve().then(() => {
      scrollDomToBottom();
      if (force) scheduleScrollMetricsRead();
    });
  };
  const schedulePostSubmitScrollToBottom = () => {
    Promise.resolve().then(() => scrollToBottom(true));
  };
  const loadOlderMessagesAtTop = async () => {
    if (isProgrammaticScrollActive() || !canLoadOlderMessages()) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    const prevScrollHeight = el.scrollHeight;
    const prevScrollTop = el.scrollTop;
    const loadedCount = await loadOlderMessages();
    if (loadedCount === 0) return;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        const nextScrollHeight = el.scrollHeight;
        el.scrollTop = prevScrollTop + (nextScrollHeight - prevScrollHeight);
        resolve();
      });
    });
  };
  const onScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    scheduleScrollMetricsRead(true);
    if (el.scrollTop <= TOP_HISTORY_THRESHOLD) {
      void loadOlderMessagesAtTop();
    }
  };
  return {
    scrollContainerRef,
    scrollModeRef,
    scrollReadFrameRef,
    scrollDomToBottom,
    scrollToBottom,
    schedulePostSubmitScrollToBottom,
    onScroll,
  };
}
/** Restores a session's messages on session switch (module-level hook). */
function useChatSessionRestore(input: {
  sessionId: string;
  messageStore: ReturnType<typeof useMessageStore>;
  spotlightStore: ReturnType<typeof useSpotlightStore>;
  messageSearchRootRef: RefObject<HTMLDivElement | null>;
  spotlightJumpTimerRef: RefObject<number | null>;
  cancelSessionRestoreTaskRef: RefObject<(() => void) | null>;
  scrollDomToBottom: () => void;
}) {
  const {
    sessionId,
    messageStore,
    spotlightStore,
    messageSearchRootRef,
    spotlightJumpTimerRef,
    cancelSessionRestoreTaskRef,
    scrollDomToBottom,
  } = input;
  // Latest-value indirection for unstable hook stores read from effects.
  const messageStoreRef = useRef(messageStore);
  useEffect(() => {
    messageStoreRef.current = messageStore;
  }, [messageStore]);
  const spotlightStoreRef = useRef(spotlightStore);
  useEffect(() => {
    spotlightStoreRef.current = spotlightStore;
  }, [spotlightStore]);
  useEffect(() => {
    const sessionRestoreScrollFrameRef: { current: number | null } = { current: null };
    const sessionRestoreScrollTimerRef: { current: number | null } = { current: null };
    const cancelSessionRestoreScrollIntentListenersRef: { current: (() => void) | null } = { current: null };
    const sessionRestoreResizeObserverRef: { current: ResizeObserver | null } = { current: null };
    const sessionRestoreRequestIdRef = { current: 0 };
    function cancelSessionRestoreScrollSettle() {
      if (sessionRestoreScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(sessionRestoreScrollFrameRef.current);
        sessionRestoreScrollFrameRef.current = null;
      }
      if (sessionRestoreScrollTimerRef.current !== null) {
        window.clearTimeout(sessionRestoreScrollTimerRef.current);
        sessionRestoreScrollTimerRef.current = null;
      }
      cancelSessionRestoreScrollIntentListenersRef.current?.();
      cancelSessionRestoreScrollIntentListenersRef.current = null;
      sessionRestoreResizeObserverRef.current?.disconnect();
      sessionRestoreResizeObserverRef.current = null;
    }
    async function focusPendingSpotlightMessageJump(): Promise<void> {
      const pendingJump = spotlightStoreRef.current.pendingMessageJump;
      if (!pendingJump || pendingJump.sessionId !== sessionId) return;
      for (let attempt = 0; attempt <= MAX_MESSAGE_JUMP_RETRIES; attempt += 1) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const target = messageSearchRootRef.current?.querySelector<HTMLElement>(
          `[data-message-id="${CSS.escape(pendingJump.messageId)}"]`,
        );
        if (target) {
          target.scrollIntoView({
            block: "center",
            inline: "nearest",
            behavior: "auto",
          });
          target.classList.add("message-highlight");
          window.setTimeout(() => target.classList.remove("message-highlight"), MESSAGE_HIGHLIGHT_DURATION);
          spotlightStoreRef.current.clearPendingMessageJump();
          return;
        }
        if (attempt === MAX_MESSAGE_JUMP_RETRIES) return;
        await new Promise<void>((resolve) => {
          spotlightJumpTimerRef.current = window.setTimeout(() => resolve(), MESSAGE_JUMP_RETRY_INTERVAL);
        });
      }
    }
    displayMessageCache.clear();
    sessionRestoreRequestIdRef.current += 1;
    cancelSessionRestoreTaskRef.current?.();
    cancelSessionRestoreTaskRef.current = null;
    messageStoreRef.current.clear();
    clearPendingInputStore();
    if (sessionId) {
      const requestId = sessionRestoreRequestIdRef.current;
      cancelSessionRestoreTaskRef.current = scheduleStartupDeferredTask(async () => {
        if (requestId !== sessionRestoreRequestIdRef.current) return;
        console.info(`[Startup][Renderer] ChatPage restoring session ${sessionId}`);
        const restored = await messageStoreRef.current.loadMessages(sessionId, INITIAL_MESSAGE_RESTORE_COUNT);
        applyRestoredSession(restored);
        await loadPendingInputs(sessionId);
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        if (spotlightStoreRef.current.pendingMessageJump?.sessionId === sessionId) {
          cancelSessionRestoreScrollSettle();
          void focusPendingSpotlightMessageJump();
          return;
        }
        scrollDomToBottom();
      });
    }
  }, [sessionId, scrollDomToBottom, messageSearchRootRef, spotlightJumpTimerRef, cancelSessionRestoreTaskRef]);
}
/** Chat search bar state (open/query/matches/active index) plus close cleanup. */
function useChatSearchState(input: { messageSearchRootRef: RefObject<HTMLDivElement | null> }) {
  const { messageSearchRootRef } = input;
  const chatSearchRefreshFrameRef = useRef<number | null>(null);
  const [isChatSearchOpen, setIsChatSearchOpen] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const [chatSearchMatches, setChatSearchMatches] = useState<ChatSearchMatch[]>([]);
  const [activeChatSearchIndex, setActiveChatSearchIndex] = useState(0);
  const openChatSearch = () => setIsChatSearchOpen(true);
  const closeChatSearch = () => {
    if (chatSearchRefreshFrameRef.current !== null) {
      window.cancelAnimationFrame(chatSearchRefreshFrameRef.current);
      chatSearchRefreshFrameRef.current = null;
    }
    clearChatSearchHighlights(messageSearchRootRef.current);
    setChatSearchMatches([]);
    setChatSearchQuery("");
    setActiveChatSearchIndex(0);
    setIsChatSearchOpen(false);
  };
  return {
    isChatSearchOpen,
    openChatSearch,
    chatSearchQuery,
    setChatSearchQuery,
    chatSearchMatches,
    setChatSearchMatches,
    activeChatSearchIndex,
    setActiveChatSearchIndex,
    closeChatSearch,
  };
}
/** Window-level chat page event handlers (Ask-AI context menu, workspace reference insert, Ctrl/Cmd+F). */
function useChatWindowEventHandlers(input: {
  sessionId: string;
  isReadOnlySession: boolean;
  setMessage: (message: string) => void;
  chatInputRef: RefObject<ThreadComposerHandle | null>;
  openChatSearch: () => void;
  chatSearchBarRef: RefObject<{
    focusInput: () => void;
    selectInput: () => void;
  } | null>;
}) {
  const { sessionId, isReadOnlySession, setMessage, chatInputRef, openChatSearch, chatSearchBarRef } = input;
  const handleContextMenuAskAI = (event: Event) => {
    if (isReadOnlySession) return;
    const detail = (event as CustomEvent<string>).detail;
    const text = typeof detail === "string" ? detail.trim() : "";
    if (!text) return;
    setMessage(text);
  };
  const handleWorkspaceInsertReferenceRequested = (event: Event) => {
    if (isReadOnlySession) return;
    const detail = (
      event as CustomEvent<{
        sessionId?: unknown;
        filePath?: unknown;
      }>
    ).detail;
    const evtSessionId = typeof detail?.sessionId === "string" ? detail.sessionId.trim() : "";
    const filePath = typeof detail?.filePath === "string" ? detail.filePath.trim() : "";
    if (evtSessionId !== sessionId || !filePath) return;
    chatInputRef.current?.insertWorkspaceReference?.(filePath);
  };
  const handleWindowKeydown = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
      event.preventDefault();
      openChatSearch();
      Promise.resolve().then(() => chatSearchBarRef.current?.selectInput());
      return;
    }
  };
  return { handleContextMenuAskAI, handleWorkspaceInsertReferenceRequested, handleWindowKeydown };
}
/** Builds the display-message list (records + ephemeral streaming row) and measure handling. */
function useChatDisplayMessages(input: {
  streamState: typeof streamStateStore.state;
  messageStore: ReturnType<typeof useMessageStore>;
  modelStore: ReturnType<typeof useModelStore>;
  activeSession: import("#/stores/ui/session").UIActiveSessionSummary | null;
  sessionId: string;
  hasInlineStreamingTarget: boolean;
  ephemeralRateLimitBlock: DisplayAssistantMessageBlock | null;
  scrollModeRef: RefObject<"initial-bottom" | "auto-follow" | "anchored-reading" | "manual-jump">;
  scrollToBottom: (force?: boolean) => void;
}) {
  const {
    streamState,
    messageStore,
    modelStore,
    activeSession,
    sessionId,
    hasInlineStreamingTarget,
    ephemeralRateLimitBlock,
    scrollModeRef,
    scrollToBottom,
  } = input;
  const displayContext: DisplayMessageContext = { messageStore, modelStore, activeSession, sessionId };
  const displayMessages = (() => {
    const msgs: DisplayMessage[] = [];
    for (const rec of messageStore.getMessages()) {
      msgs.push(toDisplayMessage(rec, displayContext));
    }
    if (streamState.isStreaming && !hasInlineStreamingTarget && !ephemeralRateLimitBlock) {
      msgs.push(
        toStreamingMessage(
          streamState.streamingBlocks,
          streamState.currentStreamMessageId,
          streamState.streamStartedAt,
          displayContext,
        ),
      );
    }
    return msgs;
  })();
  const messageWindow = useMessageWindow(displayMessages);
  const messageWindowRef = useRef(messageWindow);
  const scrollToBottomRef = useRef(scrollToBottom);
  useEffect(() => {
    messageWindowRef.current = messageWindow;
    scrollToBottomRef.current = scrollToBottom;
  });
  const onMessageMeasure = (payload: { messageId: string; height: number }) => {
    const mode = scrollModeRef.current;
    const isBottomFollowing = mode === "initial-bottom" || mode === "auto-follow";
    const delta = messageWindowRef.current.setMeasuredHeight(payload.messageId, payload.height);
    if (delta === 0) return;
    if (isBottomFollowing) {
      scrollToBottomRef.current(mode === "initial-bottom");
    }
  };
  return { displayMessages, messageWindow, onMessageMeasure };
}
/** All chat page mutations: submit/queue/steer, tool interactions, message ops, pending-input ops. */
function useChatActions(input: {
  sessionId: string;
  activeSession: import("#/stores/ui/session").UIActiveSessionSummary | null;
  isGenerating: boolean;
  isReadOnlySession: boolean;
  isAcpWorkdirMissing: boolean;
  isDaemonConnected: boolean;
  message: string;
  attachedFiles: MessageFile[];
  setMessage: (message: string) => void;
  setAttachedFiles: (files: MessageFile[]) => void;
  chatInputRef: RefObject<ThreadComposerHandle | null>;
  chatClient: ReturnType<typeof createChatClient>;
  sessionClient: ReturnType<typeof createSessionClient>;
  messageStore: ReturnType<typeof useMessageStore>;
  prepareFilesForCurrentModel: (files: MessageFile[]) => Promise<MessageFile[]>;
  activePendingInteraction: PendingInteractionView | null;
  isHandlingInteraction: boolean;
  setIsHandlingInteraction: (value: boolean) => void;
  isCancelling: boolean;
  setIsCancelling: (value: boolean) => void;
  setTraceMessageId: (value: string | null) => void;
  schedulePostSubmitScrollToBottom: () => void;
}) {
  const {
    sessionId,
    activeSession,
    isGenerating,
    isReadOnlySession,
    isAcpWorkdirMissing,
    isDaemonConnected,
    message,
    attachedFiles,
    setMessage,
    setAttachedFiles,
    chatInputRef,
    chatClient,
    sessionClient,
    messageStore,
    prepareFilesForCurrentModel,
    activePendingInteraction,
    isHandlingInteraction,
    setIsHandlingInteraction,
    isCancelling,
    setIsCancelling,
    setTraceMessageId,
    schedulePostSubmitScrollToBottom,
  } = input;
  const { toast } = useToast();
  const handleManualCompactionCommand = async (text: string): Promise<boolean> => {
    if (!isManualCompactionCommand(text)) return false;
    if (activeSession?.providerId === "acp") return false;
    if (isGenerating) return true;
    try {
      const result = await sessionClient.compactSession(sessionId);
      if (!result.compacted) {
        toast({
          title: "No changes",
          description: "Nothing to compact.",
        });
      }
    } catch (error) {
      console.error("[ChatPage] manual compaction failed:", error);
      toast({
        title: "Compaction Failed",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
    return true;
  };
  const onSubmit = async () => {
    if (isReadOnlySession || isAcpWorkdirMissing || !isDaemonConnected) return;
    if (activePendingInteraction || isHandlingInteraction) return;
    const text = message.trim();
    const files = await prepareFilesForCurrentModel([...attachedFiles]);
    if (!text && files.length === 0) return;
    if (await handleManualCompactionCommand(text)) {
      if (!isGenerating) setMessage("");
      return;
    }
    if (isGenerating) {
      await queueInput(sessionId, {
        text,
        files,
      });
    } else {
      clearPlanSnapshot(sessionId);
      addOptimisticUserMessage(sessionId, text, files);
      await chatClient.sendMessage(sessionId, {
        text,
        files,
      });
    }
    unsettleSession(sessionId);
    setMessage("");
    setAttachedFiles([]);
    chatInputRef.current?.clearInput();
    schedulePostSubmitScrollToBottom();
  };
  const onCommandSubmit = async (command: string) => {
    if (isReadOnlySession || isAcpWorkdirMissing || !isDaemonConnected) return;
    if (activePendingInteraction || isHandlingInteraction) return;
    const text = command.trim();
    if (!text) return;
    if (await handleManualCompactionCommand(text)) return;
    const files = await prepareFilesForCurrentModel([...attachedFiles]);
    if (isGenerating) {
      await queueInput(sessionId, {
        text,
        files,
      });
    } else {
      clearPlanSnapshot(sessionId);
      addOptimisticUserMessage(sessionId, text, files);
      await chatClient.sendMessage(sessionId, {
        text,
        files,
      });
    }
    unsettleSession(sessionId);
    setAttachedFiles([]);
    chatInputRef.current?.clearInput();
    setMessage("");
    schedulePostSubmitScrollToBottom();
  };
  const onQueueSubmit = async () => {
    if (isReadOnlySession || isAcpWorkdirMissing) return;
    if (activePendingInteraction || isHandlingInteraction) return;
    const text = message.trim();
    const files = await prepareFilesForCurrentModel([...attachedFiles]);
    if (!text && files.length === 0) return;
    if (await handleManualCompactionCommand(text)) return;
    await queueInput(sessionId, {
      text,
      files,
    });
    setMessage("");
    setAttachedFiles([]);
  };
  const onSteer = async () => {
    if (isReadOnlySession || isAcpWorkdirMissing) return;
    if (activePendingInteraction || isHandlingInteraction) return;
    const text = message.trim();
    const files = await prepareFilesForCurrentModel([...attachedFiles]);
    if (!text && files.length === 0) return;
    if (await handleManualCompactionCommand(text)) return;
    clearPlanSnapshot(sessionId);
    addOptimisticUserMessage(sessionId, text, files);
    try {
      await chatClient.steerActiveTurn(sessionId, {
        text,
        files,
      });
      setMessage("");
      setAttachedFiles([]);
      chatInputRef.current?.clearInput();
    } catch (error) {
      console.error("[ChatPage] steer failed:", error);
    }
  };
  const onToolInteractionRespond = async (response: ToolInteractionResponse) => {
    if (isReadOnlySession) return;
    const interaction = activePendingInteraction;
    if (!interaction || isHandlingInteraction) return;
    setIsHandlingInteraction(true);
    try {
      await chatClient.respondToolInteraction({
        sessionId: interaction.sessionId,
        messageId: interaction.messageId,
        toolCallId: interaction.toolCallId,
        response,
      });
    } catch (error) {
      console.error("[ChatPage] respond tool interaction failed:", error);
    }
    setIsHandlingInteraction(false);
  };
  const onStop = async () => {
    if (isReadOnlySession || !isGenerating || isCancelling) return;
    setIsCancelling(true);
    try {
      await chatClient.stopStream({
        sessionId,
      });
    } catch (error) {
      console.error("[ChatPage] cancel generation failed:", error);
      setIsCancelling(false);
    }
  };
  const onMessageRetry = async (messageId: string) => {
    if (isReadOnlySession || !messageId) return;
    if (activePendingInteraction || isHandlingInteraction) return;
    try {
      messageStore.clearStreamingState();
      await sessionClient.retryMessage(sessionId, messageId);
    } catch (error) {
      console.error("[ChatPage] retry message failed:", error);
    }
  };
  const onMessageDelete = async (messageId: string) => {
    if (isReadOnlySession || !messageId) return;
    try {
      messageStore.clearStreamingState();
      await sessionClient.deleteMessage(sessionId, messageId);
    } catch (error) {
      console.error("[ChatPage] delete message failed:", error);
    }
  };
  const onMessageEditSave = async (payload: { messageId: string; text: string }) => {
    if (isReadOnlySession) return;
    const { messageId, text } = payload;
    if (!messageId || !text?.trim()) return;
    try {
      await sessionClient.editUserMessage(sessionId, messageId, text.trim());
      await onMessageRetry(messageId);
    } catch (error) {
      console.error("[ChatPage] edit message failed:", error);
    }
  };
  const onMessageFork = async (messageId: string) => {
    if (isReadOnlySession || !messageId) return;
    try {
      const forked = await sessionClient.forkSession(sessionId, messageId);
      await fetchSessions();
      await selectSession(forked.id);
    } catch (error) {
      console.error("[ChatPage] fork session failed:", error);
    }
  };
  const onMessageContinue = async (_conversationId: string, messageId: string) => {
    if (isReadOnlySession || !messageId) return;
    try {
      messageStore.clearStreamingState();
      await sessionClient.retryMessage(sessionId, messageId);
    } catch (error) {
      console.error("[ChatPage] continue message failed:", error);
    }
  };
  const onMessageTrace = (messageId: string) => {
    setTraceMessageId(messageId);
  };
  const onPendingInputUpdate = async (payload: { itemId: string; text: string }) => {
    if (isReadOnlySession) return;
    const target = getQueueItems().find((item) => item.id === payload.itemId);
    if (!target) return;
    await updateQueueInput(sessionId, payload.itemId, {
      text: payload.text,
      files: target.payload.files ?? [],
    });
  };
  const onPendingInputMove = async (payload: { itemId: string; toIndex: number }) => {
    if (isReadOnlySession) return;
    await moveQueueInput(sessionId, payload.itemId, payload.toIndex);
  };
  const onPendingInputDelete = async (itemId: string) => {
    if (isReadOnlySession) return;
    await deleteQueueInput(sessionId, itemId);
  };
  const onSteerPendingInput = async (itemId: string) => {
    if (isReadOnlySession || !sessionId) return;
    try {
      await steerPendingInput(sessionId, itemId);
    } catch {
      // Error is already surfaced in the store state
    }
  };
  return {
    onSubmit,
    onCommandSubmit,
    onQueueSubmit,
    onSteer,
    onToolInteractionRespond,
    onStop,
    onMessageRetry,
    onMessageDelete,
    onMessageEditSave,
    onMessageFork,
    onMessageContinue,
    onMessageTrace,
    onPendingInputUpdate,
    onPendingInputMove,
    onPendingInputDelete,
    onSteerPendingInput,
  };
}
function ChatSearchOverlay(input: {
  barRef: RefObject<{
    focusInput: () => void;
    selectInput: () => void;
  } | null>;
  query: string;
  onQueryChange: (query: string) => void;
  matches: ChatSearchMatch[];
  activeMatchIndex: number;
  onActiveMatchIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const { barRef, query, onQueryChange, matches, activeMatchIndex, onActiveMatchIndexChange, onClose } = input;
  return (
    <div className="pointer-events-none sticky top-14 z-20 px-6">
      <div className="mx-auto flex w-full max-w-5xl justify-end">
        <div className="pointer-events-auto">
          <ChatSearchBar
            ref={barRef}
            modelValue={query}
            onUpdateModelValue={onQueryChange}
            activeMatch={activeMatchIndex}
            totalMatches={matches.length}
            onPrevious={() => {
              if (matches.length === 0) return;
              const next = (activeMatchIndex - 1 + matches.length) % matches.length;
              onActiveMatchIndexChange(next);
              setActiveChatSearchMatch(matches, next, {
                behavior: "smooth",
              });
            }}
            onNext={() => {
              if (matches.length === 0) return;
              const next = (activeMatchIndex + 1) % matches.length;
              onActiveMatchIndexChange(next);
              setActiveChatSearchMatch(matches, next, {
                behavior: "smooth",
              });
            }}
            onClose={onClose}
          />
        </div>
      </div>
    </div>
  );
}
function ChatComposerDock(input: {
  sessionId: string;
  isGenerating: boolean;
  latestPlanSnapshot: (typeof agentPlanStore.state.snapshots)[string] | null;
  isPlanFloatCollapsed: boolean;
  activePendingInteraction: PendingInteractionView | null;
  isHandlingInteraction: boolean;
  onDismissPlanFloat: () => void;
  onTogglePlanCollapse: () => void;
  onToolInteractionRespond: (response: ToolInteractionResponse) => Promise<void>;
  onDeleteQueue: (itemId: string) => Promise<void>;
  onSteerQueueItem: (itemId: string) => Promise<void>;
  heroHostRef: RefObject<HTMLDivElement | null>;
  planFloatLayerRef: RefObject<HTMLDivElement | null>;
  chatInputRef: RefObject<ThreadComposerHandle | null>;
  message: string;
  onMessageChange: (message: string) => void;
  attachedFiles: MessageFile[];
  onFilesChange: (files: MessageFile[]) => void;
  workspacePath: string | null;
  isAcpSession: boolean;
  isCancelling: boolean;
  submitDisabled: boolean;
  sendDisabled: boolean;
  queueDisabled: boolean;
  onQueueSubmit: () => Promise<void>;
  onSteer: () => Promise<void>;
  onStop: () => Promise<void>;
  onCommandSubmit: (command: string) => Promise<void>;
  onSubmit: () => void;
}) {
  const {
    sessionId,
    isGenerating,
    latestPlanSnapshot,
    isPlanFloatCollapsed,
    activePendingInteraction,
    isHandlingInteraction,
    onDismissPlanFloat,
    onTogglePlanCollapse,
    onToolInteractionRespond,
    onDeleteQueue,
    onSteerQueueItem,
    heroHostRef,
    planFloatLayerRef,
    chatInputRef,
    message,
    onMessageChange,
    attachedFiles,
    onFilesChange,
    workspacePath,
    isAcpSession,
    isCancelling,
    submitDisabled,
    sendDisabled,
    queueDisabled,
    onQueueSubmit,
    onSteer,
    onStop,
    onCommandSubmit,
    onSubmit,
  } = input;
  return (
    <div className="chat-capture-hide sticky bottom-0 z-10 w-full px-6 pb-3 pt-3">
      <div className="mx-auto flex w-full max-w-5xl min-w-0 flex-col items-center">
        <div className="relative w-full">
          <PendingInputLane
            steerItems={getSteerItems()}
            queueItems={getQueueItems()}
            disableSteerAction={isAtCapacity()}
            isGenerating={isGenerating}
            onDeleteQueue={onDeleteQueue}
            onDeleteSteer={onDeleteQueue}
            onSteerQueueItem={onSteerQueueItem}
          />
          <div>
            {(latestPlanSnapshot || activePendingInteraction) && (
              <div
                ref={planFloatLayerRef}
                className="pointer-events-none absolute inset-x-0 bottom-[calc(100%+0.75rem)] z-20 flex w-full flex-col items-end gap-2"
                data-testid="agent-progress-float-layer"
              >
                {activePendingInteraction && latestPlanSnapshot && (
                  <div className="agent-question-panel pointer-events-auto mx-auto w-full max-w-2xl overflow-hidden rounded-[20px] text-foreground backdrop-blur-[26px]">
                    <div className="agent-question-panel__backdrop" aria-hidden="true" />
                    <AgentProgressFloat
                      snapshot={latestPlanSnapshot}
                      collapsed={isPlanFloatCollapsed}
                      embedded={true}
                      onDismiss={onDismissPlanFloat}
                      onToggleCollapse={onTogglePlanCollapse}
                    />
                    <div className="agent-question-divider" aria-hidden="true" />
                    <ChatToolInteractionOverlay
                      embedded={true}
                      interaction={activePendingInteraction}
                      processing={isHandlingInteraction}
                      onRespond={onToolInteractionRespond}
                    />
                  </div>
                )}
                {activePendingInteraction && !latestPlanSnapshot && (
                  <div className="pointer-events-auto mx-auto">
                    <ChatToolInteractionOverlay
                      interaction={activePendingInteraction}
                      processing={isHandlingInteraction}
                      onRespond={onToolInteractionRespond}
                    />
                  </div>
                )}
                {!activePendingInteraction && latestPlanSnapshot && (
                  <AgentProgressFloat
                    snapshot={latestPlanSnapshot}
                    collapsed={isPlanFloatCollapsed}
                    onDismiss={onDismissPlanFloat}
                    onToggleCollapse={onTogglePlanCollapse}
                  />
                )}
              </div>
            )}
            {!activePendingInteraction && (
              <div ref={heroHostRef} className="mx-auto flex w-full max-w-4xl flex-col">
                <SettledBanner sessionId={sessionId} />
                <ThreadComposer
                  ref={chatInputRef}
                  message={message}
                  onMessageChange={onMessageChange}
                  maxWidthClass="max-w-4xl"
                  files={attachedFiles}
                  onFilesChange={onFilesChange}
                  sessionId={sessionId}
                  workspacePath={workspacePath}
                  isAcpSession={isAcpSession}
                  isGenerating={isGenerating}
                  isCancelling={isCancelling}
                  submitDisabled={submitDisabled}
                  sendDisabled={sendDisabled}
                  queueDisabled={queueDisabled}
                  onQueueSubmit={onQueueSubmit}
                  onSteer={onSteer}
                  onStop={onStop}
                  onCommandSubmit={onCommandSubmit}
                  onSubmit={onSubmit}
                />
                <ErrorBoundary>
                  <ChatStatusBar maxWidthClass="max-w-4xl" composerFooterActive />
                </ErrorBoundary>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
export default ChatPage;
