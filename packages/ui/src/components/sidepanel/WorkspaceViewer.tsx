import { useMemo } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { createWorkspaceClient } from "#api/WorkspaceClient";
import { useSidepanelStore, getSessionState } from "#/stores/ui/sidepanel";
import type { ArtifactState } from "#/stores/artifact";
import type { WorkspaceFilePreview, WorkspaceGitDiff } from "@argos/shared/presenter";
import { useWorkspaceViewerModel } from "./composables/useWorkspaceViewerModel";
import { WorkspaceCodePane } from "./viewer/WorkspaceCodePane";
import { WorkspacePreviewPane } from "./viewer/WorkspacePreviewPane";
import { WorkspaceInfoPane } from "./viewer/WorkspaceInfoPane";
import { WorkspaceDiffView } from "./viewer/WorkspaceDiffView";

interface WorkspaceViewerProps {
  sessionId: string;
  artifact: ArtifactState | null;
  filePreview: WorkspaceFilePreview | null;
  gitDiff: WorkspaceGitDiff | null;
  loadingFilePreview: boolean;
  loadingGitDiff: boolean;
  isFullscreen?: boolean;
  onToggleFullscreen: () => void;
}

const getPathBasename = (value: string | null | undefined) => {
  if (!value) return "";
  const segments = value.split(/[\\/]+/).filter(Boolean);
  return segments[segments.length - 1] || value;
};

export function WorkspaceViewer({
  sessionId,
  artifact,
  filePreview,
  gitDiff,
  loadingFilePreview,
  loadingGitDiff,
  isFullscreen,
  onToggleFullscreen,
}: WorkspaceViewerProps) {
  const sidepanelStore = useSidepanelStore();
  const workspaceClient = createWorkspaceClient();

  const sessionState = useMemo(() => getSessionState(sessionId), [sessionId]);

  const { activeSource, effectiveViewMode, paneKind, previewKind, shouldShowTabs } = useWorkspaceViewerModel({
    artifact: useMemo(() => artifact, [artifact]),
    filePreview: useMemo(() => filePreview, [filePreview]),
    sessionState: useMemo(() => sessionState, [sessionState]),
  });

  const viewerTitle = useMemo(() => {
    if (activeSource === "artifact") return artifact?.title || "Workspace";
    if (activeSource === "file") return filePreview?.name || getPathBasename(sessionState.selectedFilePath);
    if (activeSource === "git-diff") return gitDiff?.relativePath || "Git";
    return "Workspace";
  }, [activeSource, artifact, filePreview, sessionState, gitDiff]);

  const viewerSubtitle = useMemo(() => {
    if (activeSource === "file") return filePreview?.relativePath || sessionState.selectedFilePath || "";
    if (activeSource === "git-diff") return "Git";
    return "";
  }, [activeSource, filePreview, sessionState, gitDiff]);

  const previewArtifact = useMemo(() => (activeSource === "artifact" ? artifact : null), [activeSource, artifact]);
  const previewFilePreview = useMemo(() => (activeSource === "file" ? filePreview : null), [activeSource, filePreview]);

  const codeSource = useMemo(() => {
    if (activeSource === "artifact" && artifact) {
      return {
        id: artifact.id,
        content: artifact.content,
        language: artifact.language ?? null,
        type: artifact.type,
      };
    }
    if (activeSource !== "file" || !filePreview) return null;
    const type =
      filePreview.kind === "markdown"
        ? "text/markdown"
        : filePreview.kind === "html"
          ? "text/html"
          : filePreview.kind === "svg"
            ? "image/svg+xml"
            : filePreview.mimeType || "application/vnd.ant.code";
    return {
      id: filePreview.path,
      content: filePreview.content,
      language: filePreview.language ?? null,
      type,
    };
  }, [activeSource, artifact, filePreview]);

  const openFilePath = useMemo(() => {
    if (activeSource !== "file") return null;
    return filePreview?.path ?? sessionState.selectedFilePath;
  }, [activeSource, filePreview, sessionState]);

  const emptyMessage = useMemo(() => {
    if (activeSource === "file" && !loadingFilePreview) return "No file selected";
    return "Workspace";
  }, [activeSource, loadingFilePreview]);

  const fullscreenToggleLabel = isFullscreen ? "Restore" : "Maximize";

  const handleOpenFile = async () => {
    if (!openFilePath) return;
    await workspaceClient.openFile(openFilePath);
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-background">
      <div className="flex h-11 shrink-0 items-center justify-between border-b px-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium">{viewerTitle}</h3>
          {viewerSubtitle && <p className="truncate text-xs text-muted-foreground">{viewerSubtitle}</p>}
        </div>

        <div className="flex items-center gap-2">
          {shouldShowTabs && (
            <div className="flex items-center rounded-lg bg-muted p-0.5 text-xs text-muted-foreground">
              <button
                className={`rounded-md px-2 py-1 transition-colors ${effectiveViewMode === "preview" ? "bg-background text-foreground shadow-sm" : ""}`}
                type="button"
                onClick={() => sidepanelStore.setViewMode(sessionId, "preview")}
              >
                Preview
              </button>
              <button
                className={`rounded-md px-2 py-1 transition-colors ${effectiveViewMode === "code" ? "bg-background text-foreground shadow-sm" : ""}`}
                type="button"
                onClick={() => sidepanelStore.setViewMode(sessionId, "code")}
              >
                Code
              </button>
            </div>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            data-testid="workspace-viewer-fullscreen-toggle"
            title={fullscreenToggleLabel}
            aria-label={fullscreenToggleLabel}
            onClick={onToggleFullscreen}
          >
            <Icon icon={isFullscreen ? "lucide:minimize-2" : "lucide:maximize-2"} className="h-4 w-4" />
          </Button>

          {openFilePath && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleOpenFile}>
              Open File
            </Button>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-testid="workspace-viewer-body">
        {paneKind === "empty" && !(activeSource === "file" && loadingFilePreview) && (
          <div className="flex h-full items-center justify-center px-6">
            <div className="text-center text-sm text-muted-foreground">{emptyMessage}</div>
          </div>
        )}

        {activeSource === "file" && loadingFilePreview && (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            Loading...
          </div>
        )}

        {paneKind === "git-diff" && !(activeSource === "file" && loadingFilePreview) && (
          <div className="h-full overflow-auto bg-background py-3 text-xs leading-6">
            {loadingGitDiff ? (
              <div className="px-4 text-muted-foreground">Loading...</div>
            ) : gitDiff ? (
              <>
                {gitDiff.staged && (
                  <section className="mb-4">
                    <h4 className="mb-2 px-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Staged
                    </h4>
                    <WorkspaceDiffView diff={gitDiff.staged} />
                  </section>
                )}
                {gitDiff.unstaged && (
                  <section>
                    <h4 className="mb-2 px-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Unstaged
                    </h4>
                    <WorkspaceDiffView diff={gitDiff.unstaged} />
                  </section>
                )}
                {!gitDiff.staged && !gitDiff.unstaged && <div className="px-4 text-muted-foreground">No changes</div>}
              </>
            ) : (
              <div className="px-4 text-muted-foreground">No changes</div>
            )}
          </div>
        )}

        {paneKind === "code" && codeSource && <WorkspaceCodePane source={codeSource} />}

        {paneKind === "preview" && previewKind && (
          <WorkspacePreviewPane
            sessionId={sessionId}
            previewKind={previewKind}
            artifact={previewArtifact}
            filePreview={previewFilePreview}
          />
        )}

        {paneKind === "info" && filePreview && <WorkspaceInfoPane filePreview={filePreview} />}

        {!["empty", "git-diff", "code", "preview", "info"].includes(paneKind) && (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            Workspace
          </div>
        )}
      </div>
    </div>
  );
}
