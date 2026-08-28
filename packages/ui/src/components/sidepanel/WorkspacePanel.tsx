import { type DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { createFileClient } from "#api/FileClient";
import { createProjectClient } from "#api/ProjectClient";
import { createWorkspaceClient } from "#api/WorkspaceClient";
import { extractArtifactsFromContent } from "#/composables/useArtifacts";
import { TreesFileTree } from "./TreesFileTree";
import { WorkspaceViewer } from "./WorkspaceViewer";
import { useWorkspaceSync } from "./composables/useWorkspaceSync";
import { useArtifactStore } from "#/stores/artifact";
import { useMessageStore, getMessages } from "#/stores/ui/message";
import { useSidepanelStore, getSessionState, type WorkspaceArtifactContext } from "#/stores/ui/sidepanel";
import { useSessionStore } from "#/stores/ui/session";
import type { WorkspaceNavSection } from "@argos/shared/presenter";

interface WorkspacePanelProps {
  sessionId: string;
  workspacePath: string | null;
  isFullscreen?: boolean;
  onUpdateWorkspacePath?: (path: string | null) => void;
  onToggleFullscreen: () => void;
  onInsertFileReference: (filePath: string) => void;
}

type ArtifactItem = WorkspaceArtifactContext & {
  key: string;
  identifier: string;
  title: string;
  type: string;
  language?: string;
  content: string;
  status: "loading" | "loaded";
  createdAt: number;
};

const NAV_COLLAPSED_WIDTH = 38;

const getArtifactIcon = (type: string) => {
  switch (type) {
    case "application/vnd.ant.code":
      return "lucide:square-code";
    case "text/markdown":
      return "vscode-icons:file-type-markdown";
    case "text/html":
      return "vscode-icons:file-type-html";
    case "image/svg+xml":
      return "vscode-icons:file-type-svg";
    case "application/vnd.ant.mermaid":
      return "vscode-icons:file-type-mermaid";
    case "application/vnd.ant.react":
      return "vscode-icons:file-type-reactts";
    default:
      return "lucide:file";
  }
};

export function WorkspacePanel({
  sessionId,
  workspacePath,
  isFullscreen,
  onUpdateWorkspacePath,
  onToggleFullscreen,
  onInsertFileReference,
}: WorkspacePanelProps) {
  const artifactStore = useArtifactStore();
  const messageStore = useMessageStore();
  const sidepanelStore = useSidepanelStore();
  const sessionStore = useSessionStore();
  const workspaceClient = useMemo(() => createWorkspaceClient(), []);
  const projectClient = useMemo(() => createProjectClient(), []);
  const fileClient = useMemo(() => createFileClient(), []);

  // Read reactively from the store (NOT memoized by sessionId) so selection /
  // section state changes propagate to useWorkspaceSync immediately.
  const sessionState = getSessionState(sessionId);
  const navCollapsed = sidepanelStore.navCollapsed;

  const { selectedFilePreview, selectedGitDiff, loadingFilePreview, loadingGitDiff } = useWorkspaceSync({
    sessionId: useMemo(() => sessionId, [sessionId]),
    workspacePath: useMemo(() => workspacePath, [workspacePath]),
    active: useMemo(() => sidepanelStore.open, [sidepanelStore.open]),
    sessionState: useMemo(() => sessionState, [sessionState]),
    workspaceClient,
    sidepanelStore,
  });

  const messages = getMessages();
  const artifactItems = useMemo<ArtifactItem[]>(() => {
    const items: ArtifactItem[] = [];
    for (const message of messages) {
      if (message.sessionId !== sessionId || message.role !== "assistant") continue;
      for (const block of messageStore.getAssistantMessageBlocks(message)) {
        for (const artifact of extractArtifactsFromContent(block.content ?? "", block.status)) {
          items.push({
            key: `${message.id}:${artifact.identifier}`,
            threadId: sessionId,
            messageId: message.id,
            artifactId: artifact.identifier,
            identifier: artifact.identifier,
            title: artifact.title,
            type: artifact.type,
            language: artifact.language,
            content: artifact.content,
            status: artifact.loading ? "loading" : "loaded",
            createdAt: message.createdAt,
          });
        }
      }
    }
    return items.sort((a, b) => b.createdAt - a.createdAt);
  }, [messages, sessionId, messageStore]);

  const selectedArtifact = useMemo(() => {
    const context = sessionState.selectedArtifactContext;
    if (!context) return null;
    if (
      artifactStore.currentArtifact &&
      artifactStore.currentArtifact.id === context.artifactId &&
      artifactStore.currentMessageId === context.messageId &&
      artifactStore.currentThreadId === context.threadId
    ) {
      return artifactStore.currentArtifact;
    }
    const matched = artifactItems.find(
      (item) =>
        item.threadId === context.threadId &&
        item.messageId === context.messageId &&
        item.artifactId === context.artifactId,
    );
    if (!matched) return null;
    return {
      id: matched.artifactId,
      type: matched.type,
      title: matched.title,
      language: matched.language,
      content: matched.content,
      status: matched.status,
    };
  }, [sessionState, artifactStore, artifactItems]);

  useEffect(() => {
    const context = sessionState.selectedArtifactContext;
    if (!context) return;
    const existsInArtifactItems = artifactItems.some(
      (item) =>
        item.threadId === context.threadId &&
        item.messageId === context.messageId &&
        item.artifactId === context.artifactId,
    );
    const matchesCurrentArtifact =
      artifactStore.currentArtifact?.id === context.artifactId &&
      artifactStore.currentMessageId === context.messageId &&
      artifactStore.currentThreadId === context.threadId;
    if (!existsInArtifactItems && !matchesCurrentArtifact) {
      sidepanelStore.clearArtifact(sessionId);
    }
  }, [
    artifactItems,
    sessionState,
    artifactStore.currentArtifact?.id,
    artifactStore.currentMessageId,
    artifactStore.currentThreadId,
    sessionId,
    sidepanelStore,
  ]);

  const [isNavResizing, setIsNavResizing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const navWidth = sidepanelStore.getNavWidth();
  const expandedNavWidth = useMemo(() => `${navWidth}px`, [navWidth]);
  const navStyle = useMemo(
    () => ({ width: navCollapsed ? `${NAV_COLLAPSED_WIDTH}px` : expandedNavWidth }),
    [navCollapsed, expandedNavWidth],
  );

  const navResizeStartRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const pendingNavWidth = useRef<number | null>(null);
  const navResizeFrame = useRef<number | null>(null);

  const applyPendingNavResize = useCallback(() => {
    navResizeFrame.current = null;
    if (pendingNavWidth.current === null) return;
    sidepanelStore.setNavWidth(pendingNavWidth.current);
    pendingNavWidth.current = null;
  }, [sidepanelStore]);

  const stopNavResize = useCallback(() => {
    if (navResizeFrame.current !== null) {
      window.cancelAnimationFrame(navResizeFrame.current);
      navResizeFrame.current = null;
    }
    if (pendingNavWidth.current !== null) {
      sidepanelStore.setNavWidth(pendingNavWidth.current);
      pendingNavWidth.current = null;
    }
  }, [sidepanelStore]);

  const startNavResize = useCallback(
    (event: ReactMouseEvent) => {
      event.preventDefault();
      stopNavResize();
      navResizeStartRef.current = { startX: event.clientX, startWidth: sidepanelStore.getNavWidth() };
      setIsNavResizing(true);
    },
    [stopNavResize, sidepanelStore],
  );

  useEffect(() => {
    if (!isNavResizing) return;
    const start = navResizeStartRef.current;
    if (!start) return;

    const onMouseMove = (moveEvent: MouseEvent) => {
      pendingNavWidth.current = start.startWidth + (moveEvent.clientX - start.startX);
      if (navResizeFrame.current === null) {
        navResizeFrame.current = window.requestAnimationFrame(applyPendingNavResize);
      }
    };
    const onMouseUp = () => {
      setIsNavResizing(false);
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("mouseup", onMouseUp, { once: true });
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      stopNavResize();
      setIsNavResizing(false);
    };
  }, [isNavResizing, applyPendingNavResize, stopNavResize]);

  const stopNavResizeRef = useRef(stopNavResize);
  useEffect(() => {
    stopNavResizeRef.current = stopNavResize;
  }, [stopNavResize]);

  useEffect(() => {
    return () => stopNavResizeRef.current();
  }, []);

  const handleArtifactSelect = useCallback(
    (item: ArtifactItem) => {
      artifactStore.showArtifact(
        {
          id: item.artifactId,
          type: item.type,
          title: item.title,
          language: item.language,
          content: item.content,
          status: item.status,
        },
        item.messageId,
        item.threadId,
        { force: true, open: false, viewMode: "preview" },
      );
    },
    [artifactStore],
  );

  const isArtifactSelected = useCallback(
    (item: ArtifactItem) => {
      const context = sessionState.selectedArtifactContext;
      return (
        context?.threadId === item.threadId &&
        context?.messageId === item.messageId &&
        context?.artifactId === item.artifactId
      );
    },
    [sessionState],
  );

  const handleSectionClick = useCallback(
    (section: WorkspaceNavSection) => {
      if (navCollapsed) {
        sidepanelStore.setNavCollapsed(false);
        const state = sidepanelStore.getSessionState(sessionId);
        state.sections[section] = true;
        return;
      }
      sidepanelStore.toggleSection(sessionId, section);
    },
    [navCollapsed, sidepanelStore, sessionId],
  );

  const selectFolder = useCallback(async () => {
    try {
      const selectedPath = await projectClient.selectDirectory();
      if (selectedPath) {
        await sessionStore.setSessionProjectDir(sessionId, selectedPath);
        onUpdateWorkspacePath?.(selectedPath);
      }
    } catch (e) {
      console.error("Failed to select folder:", e);
    }
  }, [projectClient, sessionStore, sessionId, onUpdateWorkspacePath]);

  const handleDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    if (event.dataTransfer?.types.includes("Files")) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: DragEvent) => {
    const relatedTarget = event.relatedTarget as EventTarget | null;
    if (
      !relatedTarget ||
      !(event.currentTarget instanceof Node) ||
      !event.currentTarget.contains(relatedTarget as Node)
    ) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (event: DragEvent) => {
      event.preventDefault();
      setIsDragging(false);
      const file = event.dataTransfer?.files?.[0];
      if (!file) return;
      const filePath =
        fileClient.getPathForFile(file).trim() || ((file as File & { path?: string }).path?.trim() ?? null);
      if (!filePath) return;
      try {
        const isDirectory = await fileClient.isDirectory(filePath);
        if (!isDirectory) return;
        await sessionStore.setSessionProjectDir(sessionId, filePath);
        onUpdateWorkspacePath?.(filePath);
      } catch (e) {
        console.error("[WorkspacePanel] Failed to set workspace from drop:", e);
      }
    },
    [fileClient, sessionStore, sessionId, onUpdateWorkspacePath],
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">
      <aside
        className={`workspace-nav relative flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-r bg-muted/20 ${
          isNavResizing ? "workspace-nav--resizing" : ""
        }`}
        style={navStyle}
      >
        <div
          className="flex h-full min-h-0 shrink-0 flex-col"
          style={{ width: navCollapsed ? `${NAV_COLLAPSED_WIDTH}px` : expandedNavWidth }}
        >
          <button
            className="flex w-full shrink-0 items-center gap-2 px-3 py-2 text-muted-foreground transition-colors hover:text-foreground"
            type="button"
            title={navCollapsed ? "Expand" : "Collapse"}
            onClick={() => sidepanelStore.toggleNavCollapsed()}
          >
            <Icon
              icon={navCollapsed ? "lucide:panel-left-open" : "lucide:panel-left-close"}
              className="h-3.5 w-3.5 shrink-0"
            />
          </button>
          <div className="flex min-h-0 flex-1 flex-col overflow-auto pb-2">
            <section className="flex min-h-0 flex-1 flex-col">
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium"
                type="button"
                onClick={() => handleSectionClick("files")}
              >
                <Icon icon="lucide:folder-tree" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                {!navCollapsed && <span className="flex-1 truncate">Files</span>}
                {!navCollapsed && (
                  <Icon
                    icon={sessionState.sections.files ? "lucide:chevron-down" : "lucide:chevron-right"}
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  />
                )}
              </button>
              {!navCollapsed && sessionState.sections.files && (
                <div className="flex min-h-0 flex-1 flex-col pb-2">
                  {!workspacePath ? (
                    <div
                      className={`mx-2 rounded-lg border border-dashed border-muted-foreground/30 px-3 py-4 text-center ${
                        isDragging ? "border-primary bg-primary/5" : ""
                      }`}
                      onDragEnter={(e) => {
                        e.preventDefault();
                        setIsDragging(true);
                      }}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                    >
                      <Icon icon="lucide:folder-plus" className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
                      <p className="mb-2 text-xs font-medium text-foreground">No workspace</p>
                      <p className="mb-3 text-[11px] text-muted-foreground">Drag a folder or click to select</p>
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={selectFolder}>
                        <Icon icon="lucide:folder-open" className="mr-1.5 h-3.5 w-3.5" />
                        Select Folder
                      </Button>
                    </div>
                  ) : (
                    <TreesFileTree
                      workspacePath={workspacePath}
                      sessionId={sessionId}
                      onInsertFileReference={onInsertFileReference}
                    />
                  )}
                </div>
              )}
            </section>

            {artifactItems.length > 0 && (
              <section className="shrink-0">
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium"
                  type="button"
                  onClick={() => handleSectionClick("artifacts")}
                >
                  <Icon icon="lucide:box" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  {!navCollapsed && <span className="flex-1 truncate">Artifacts</span>}
                  {!navCollapsed && <span className="text-[11px] text-muted-foreground">{artifactItems.length}</span>}
                  {!navCollapsed && (
                    <Icon
                      icon={sessionState.sections.artifacts ? "lucide:chevron-down" : "lucide:chevron-right"}
                      className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                    />
                  )}
                </button>
                {!navCollapsed && sessionState.sections.artifacts && (
                  <div className="pb-2">
                    {artifactItems.map((item) => (
                      <button
                        key={item.key}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                          isArtifactSelected(item)
                            ? "bg-accent text-accent-foreground"
                            : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                        }`}
                        type="button"
                        onClick={() => handleArtifactSelect(item)}
                      >
                        <Icon icon={getArtifactIcon(item.type)} className="h-3.5 w-3.5 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{item.title || item.identifier}</span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        </div>

        {!navCollapsed && (
          <button
            data-testid="workspace-nav-resize-handle"
            className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize"
            type="button"
            onMouseDown={startNavResize}
          />
        )}
      </aside>

      <WorkspaceViewer
        sessionId={sessionId}
        artifact={selectedArtifact}
        filePreview={selectedFilePreview}
        gitDiff={selectedGitDiff}
        loadingFilePreview={loadingFilePreview}
        loadingGitDiff={loadingGitDiff}
        isFullscreen={isFullscreen}
        onToggleFullscreen={onToggleFullscreen}
      />
      <style>{`
        .workspace-nav {
          transition-duration: var(--dc-motion-default);
          transition-property: width;
          transition-timing-function: var(--dc-ease-out-express);
          will-change: width;
        }
        .workspace-nav--resizing { transition: none; }
        @media (prefers-reduced-motion: reduce) {
          .workspace-nav { transition: none; }
        }
      `}</style>
    </div>
  );
}
