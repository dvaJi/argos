import {
  type FC,
  type HTMLAttributes,
  type KeyboardEvent,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { Icon } from "@iconify/react";
import { Button } from "@shadcn/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@shadcn/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@shadcn/components/ui/dialog";
import AgentTransferDialog from "@/components/agent/AgentTransferDialog";
import { useAgentStore } from "@/stores/ui/agent";
import { useSessionStore, getNewConversationTargetAgentId } from "@/stores/ui/session";
import { useSidepanelStore } from "@/stores/ui/sidepanel";
import { useSidebarStore } from "@/stores/ui/sidebar";
import { useToast } from "@/components/use-toast";

interface ChatTopBarProps extends HTMLAttributes<HTMLDivElement> {
  sessionId: string;
  title: string;
  project: string;
  isReadOnly?: boolean;
}

const ChatTopBar: FC<ChatTopBarProps> = ({
  sessionId,
  title,
  project,
  isReadOnly: isReadOnlyProp = false,
  ...attrs
}) => {
  const sessionStore = useSessionStore();
  const agentStore = useAgentStore();
  const sidepanelStore = useSidepanelStore();
  const sidebarStore = useSidebarStore();
  const { toast } = useToast();

  const [isRenaming, setIsRenaming] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveDialogBusy, setMoveDialogBusy] = useState(false);
  const [moveDialogError, setMoveDialogError] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  const showCollapsedNewChatButton = useMemo(
    () => sidebarStore.collapsed && Boolean(getNewConversationTargetAgentId()),
    [sidebarStore.collapsed, getNewConversationTargetAgentId()],
  );
  const projectName = useMemo(() => project.split("/").pop() ?? project, [project]);
  const currentSession = useMemo(
    () => sessionStore.sessions.find((session) => session.id === sessionId) ?? null,
    [sessionStore.sessions, sessionId],
  );
  const currentTitle = useMemo(() => currentSession?.title ?? title, [currentSession?.title, title]);
  const showCollapsedNewChatSpacer = showCollapsedNewChatButton;
  const parentSessionId = useMemo(() => currentSession?.parentSessionId ?? null, [currentSession?.parentSessionId]);
  const isPinned = useMemo(() => Boolean(currentSession?.isPinned), [currentSession?.isPinned]);
  const isReadOnly = isReadOnlyProp === true;
  const currentAgent = useMemo(
    () => agentStore.agents.find((agent) => agent.id === currentSession?.agentId) ?? null,
    [agentStore.agents, currentSession?.agentId],
  );
  const currentAgentName = useMemo(
    () => currentAgent?.name ?? currentSession?.agentId ?? "",
    [currentAgent?.name, currentSession?.agentId],
  );
  const transferAgents = useMemo(
    () =>
      agentStore.enabledAgents
        .filter((agent) => agent.type === "argos")
        .map((agent) => ({
          id: agent.id,
          name: agent.name,
          type: agent.type,
          enabled: agent.enabled,
        })),
    [agentStore.enabledAgents],
  );
  const canMoveConversation = useMemo(
    () => !isReadOnly && currentSession?.sessionKind === "regular" && currentSession?.status !== "working",
    [isReadOnly, currentSession?.sessionKind, currentSession?.status],
  );
  const normalizedRenameValue = useMemo(() => renameValue.trim(), [renameValue]);
  const canSubmitRename = useMemo(
    () => normalizedRenameValue.length > 0 && normalizedRenameValue !== currentTitle.trim(),
    [normalizedRenameValue, currentTitle],
  );

  const handleCollapsedNewChat = useCallback(() => {
    void sessionStore.startNewConversation({ refresh: true });
  }, [sessionStore]);

  const resetRenameState = useCallback(() => {
    setRenameValue(currentTitle);
    setIsRenaming(false);
  }, [currentTitle]);

  const openRenameDialog = useCallback(async () => {
    if (isReadOnly) return;
    setRenameValue(currentTitle);
    setIsRenaming(true);
    requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
  }, [isReadOnly, currentTitle]);

  const handleRenameCancel = useCallback(() => {
    resetRenameState();
  }, [resetRenameState]);

  const handleRenameInputKeydown = useCallback(
    (event: KeyboardEvent) => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === "Enter") {
        event.preventDefault();
        void handleRenameConfirm();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        handleRenameCancel();
      }
    },
    [handleRenameCancel],
  );

  const handleRenameConfirm = useCallback(async () => {
    if (isReadOnly) return;
    const normalized = renameValue.trim();
    if (!normalized) {
      resetRenameState();
      return;
    }
    if (normalized === currentTitle.trim()) {
      resetRenameState();
      return;
    }
    try {
      await sessionStore.renameSession(sessionId, normalized);
      setIsRenaming(false);
    } catch (error) {
      console.error("Failed to rename chat:", error);
    }
  }, [isReadOnly, renameValue, currentTitle, sessionId, sessionStore, resetRenameState]);

  useEffect(() => {
    resetRenameState();
  }, [sessionId]);

  useEffect(() => {
    if (isReadOnlyProp) {
      resetRenameState();
    }
  }, [isReadOnlyProp, resetRenameState]);

  const handleClearConfirm = useCallback(async () => {
    if (isReadOnly) return;
    try {
      await sessionStore.clearSessionMessages(sessionId);
    } catch (error) {
      console.error("Failed to clear messages:", error);
    }
    setClearDialogOpen(false);
  }, [isReadOnly, sessionId, sessionStore]);

  const handleDeleteConfirm = useCallback(async () => {
    if (isReadOnly) return;
    try {
      await sessionStore.deleteSession(sessionId);
    } catch (error) {
      console.error("Failed to delete chat:", error);
    }
    setDeleteDialogOpen(false);
  }, [isReadOnly, sessionId, sessionStore]);

  const handleMoveConfirm = useCallback(
    async (payload: { targetAgentId: string }) => {
      if (!canMoveConversation) return;
      setMoveDialogBusy(true);
      setMoveDialogError(null);
      try {
        await sessionStore.moveSessionToAgent(sessionId, payload.targetAgentId);
        setMoveDialogOpen(false);
      } catch (error) {
        setMoveDialogError(error instanceof Error ? error.message : String(error));
      } finally {
        setMoveDialogBusy(false);
      }
    },
    [canMoveConversation, sessionId, sessionStore],
  );

  const handleExport = useCallback(
    async (format: "markdown" | "html" | "txt" | "nowledge-mem") => {
      try {
        await sessionStore.exportSession(sessionId, format);
        const isNowledgeMem = format === "nowledge-mem";
        toast({
          title: isNowledgeMem ? "Nowledge Memory exported" : "Export successful",
          description: isNowledgeMem ? "Nowledge Memory file has been saved." : "Chat has been exported.",
          variant: "default",
        });
      } catch (error) {
        console.error("Export failed:", error);
        toast({
          title: "Export failed",
          description: "Could not export the chat.",
          variant: "destructive",
        });
      }
    },
    [sessionId, sessionStore, toast],
  );

  const handleBackToParent = useCallback(async () => {
    if (!parentSessionId) return;
    try {
      await sessionStore.selectSession(parentSessionId);
    } catch (error) {
      console.error("Failed to navigate to parent session:", error);
    }
  }, [parentSessionId, sessionStore]);

  const openClearDialog = useCallback(() => {
    if (isReadOnly) return;
    setClearDialogOpen(true);
  }, [isReadOnly]);

  const openDeleteDialog = useCallback(() => {
    if (isReadOnly) return;
    setDeleteDialogOpen(true);
  }, [isReadOnly]);

  const openMoveDialog = useCallback(async () => {
    if (!canMoveConversation) return;
    setMoveDialogError(null);
    if (agentStore.agents.length === 0) {
      await agentStore.fetchAgents();
    }
    setMoveDialogOpen(true);
  }, [canMoveConversation, agentStore]);

  const handleTogglePin = useCallback(async () => {
    if (isReadOnly) return;
    try {
      await sessionStore.toggleSessionPinned(sessionId, !isPinned);
    } catch (error) {
      console.error("Failed to toggle pin status:", error);
    }
  }, [isReadOnly, sessionId, sessionStore, isPinned]);

  return (
    <>
      <div
        {...attrs}
        className={`sticky top-0 z-10 flex h-12 items-center justify-between bg-background/60 px-4 backdrop-blur-lg window-drag-region transition-[padding] duration-200 ease-out ${showCollapsedNewChatSpacer ? "pl-12" : ""}`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {showCollapsedNewChatButton && (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-30 h-12">
              <Button
                variant="ghost"
                size="icon"
                data-testid="collapsed-new-chat-button"
                className="collapsed-new-chat-button pointer-events-auto absolute left-4 top-2.5 h-7 w-7 text-muted-foreground hover:text-foreground"
                title="New chat"
                aria-label="New chat"
                onClick={handleCollapsedNewChat}
              >
                <Icon icon="lucide:plus" className="h-4 w-4" />
              </Button>
            </div>
          )}
          {parentSessionId && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
              title="Back to parent"
              onClick={handleBackToParent}
            >
              <Icon icon="lucide:corner-up-left" className="h-3.5 w-3.5" />
              <span>Back to parent</span>
            </Button>
          )}
          {project && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Icon icon="lucide:folder" className="w-3.5 h-3.5 shrink-0" />
              <span className="text-xs truncate">{projectName}</span>
              <Icon icon="lucide:chevron-right" className="w-3 h-3 shrink-0" />
            </div>
          )}
          {isReadOnly ? (
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-medium truncate">{currentTitle}</h2>
            </div>
          ) : (
            <div
              className={`title-inline-shell no-drag min-w-0 flex-1 ${isRenaming ? "title-inline-shell--editing" : ""}`}
            >
              {!isRenaming ? (
                <button
                  type="button"
                  data-testid="chat-topbar-title-trigger"
                  className="title-inline-trigger flex w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
                  title="Rename"
                  aria-label="Rename"
                  onClick={openRenameDialog}
                >
                  <span className="truncate text-sm font-medium">{currentTitle}</span>
                  <Icon icon="lucide:pencil" className="title-inline-icon h-3.5 w-3.5 shrink-0" />
                </button>
              ) : (
                <div className="title-inline-editor flex w-full min-w-0 items-center gap-1 rounded-md px-1 py-0.5">
                  <input
                    ref={renameInputRef}
                    data-testid="chat-topbar-title-input"
                    className="title-inline-input h-7 w-full min-w-0 flex-1 bg-transparent px-1 text-sm font-medium text-foreground outline-none"
                    aria-label="Rename"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={handleRenameInputKeydown}
                  />
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      data-testid="chat-topbar-title-cancel"
                      className="title-inline-action h-7 w-7 text-muted-foreground hover:text-foreground"
                      title="Cancel"
                      aria-label="Cancel"
                      onClick={handleRenameCancel}
                    >
                      <Icon icon="lucide:x" className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      data-testid="chat-topbar-title-save"
                      className="title-inline-action h-7 w-7 text-primary hover:text-primary disabled:text-muted-foreground"
                      title="Confirm"
                      aria-label="Confirm"
                      disabled={!canSubmitRename}
                      onClick={() => void handleRenameConfirm()}
                    >
                      <Icon icon="lucide:check" className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 no-drag">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            title="Workspace"
            onClick={() => sidepanelStore.toggleWorkspace(sessionId)}
          >
            <Icon icon="lucide:folder-tree" className="w-4 h-4" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                title="Share / Export"
              >
                <Icon icon="lucide:share" className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={() => void handleExport("markdown")}>
                <Icon icon="lucide:file-text" className="mr-2 h-4 w-4" />
                <span>Markdown Document (.md)</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleExport("html")}>
                <Icon icon="lucide:globe" className="mr-2 h-4 w-4" />
                <span>HTML Document (.html)</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleExport("txt")}>
                <Icon icon="lucide:file-type" className="mr-2 h-4 w-4" />
                <span>Plain Text (.txt)</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleExport("nowledge-mem")}>
                <Icon icon="lucide:brain" className="mr-2 h-4 w-4" />
                <span>Nowledge Memory (.json)</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {!isReadOnly && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  title="More options"
                >
                  <Icon icon="lucide:ellipsis" className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onSelect={() => void handleTogglePin()}>
                  <Icon icon={isPinned ? "lucide:pin-off" : "lucide:pin"} className="mr-2 h-4 w-4" />
                  <span>{isPinned ? "Unpin" : "Pin"}</span>
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canMoveConversation} onSelect={() => void openMoveDialog()}>
                  <Icon icon="lucide:move-right" className="mr-2 h-4 w-4" />
                  <span>Move conversation</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={openClearDialog}>
                  <Icon icon="lucide:eraser" className="mr-2 h-4 w-4" />
                  <span>Clear messages</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onSelect={openDeleteDialog}>
                  <Icon icon="lucide:trash-2" className="mr-2 h-4 w-4" />
                  <span>Delete</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <Dialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear Messages</DialogTitle>
            <DialogDescription>Are you sure you want to clear all messages in this conversation?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleClearConfirm()}>
              Clear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Chat</DialogTitle>
            <DialogDescription>Are you sure you want to delete this conversation?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleDeleteConfirm()}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AgentTransferDialog
        open={moveDialogOpen}
        onOpenChange={setMoveDialogOpen}
        mode="move-session"
        onConfirmDelete={handleDeleteConfirm}
        sourceAgentId={currentSession?.agentId ?? ""}
        sourceAgentName={currentAgentName}
        agents={transferAgents}
        sessionTitle={currentTitle}
        busy={moveDialogBusy}
        error={moveDialogError}
        onConfirmMove={handleMoveConfirm}
      />
    </>
  );
};

export default ChatTopBar;
