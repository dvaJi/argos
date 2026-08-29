import { useState } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { createWorkspaceClient } from "#api/WorkspaceClient";
import { useSidepanelStore, getSessionState } from "#/stores/ui/sidepanel";
import type { ArtifactState } from "#/stores/artifact";
import type { WorkspaceFilePreview, WorkspaceGitDiff } from "@argos/shared/presenter";
import { useWorkspaceViewerModel } from "./composables/useWorkspaceViewerModel";
import { DiffsCodePane } from "./viewer/DiffsCodePane";
import { DiffsEditorPane } from "./viewer/DiffsEditorPane";
import { DiffsPatchPane } from "./viewer/DiffsPatchPane";
import { WorkspacePreviewPane } from "./viewer/WorkspacePreviewPane";
import { WorkspaceInfoPane } from "./viewer/WorkspaceInfoPane";
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

  // Read reactively from the store (NOT memoized by sessionId) so selection and
  // view-mode updates propagate to `activeSource`/`paneKind` immediately.
  const sessionState = getSessionState(sessionId);
  const { activeSource, effectiveViewMode, paneKind, previewKind, shouldShowTabs } = useWorkspaceViewerModel({
    artifact: artifact,
    filePreview: filePreview,
    sessionState: sessionState,
  });
  const viewerTitle = (() => {
    if (activeSource === "artifact") return artifact?.title || "Workspace";
    if (activeSource === "file") return filePreview?.name || getPathBasename(sessionState.selectedFilePath);
    if (activeSource === "git-diff") return gitDiff?.relativePath || "Git";
    return "Workspace";
  })();
  const viewerSubtitle = (() => {
    if (activeSource === "file") return filePreview?.relativePath || sessionState.selectedFilePath || "";
    if (activeSource === "git-diff") return "Git";
    return "";
  })();
  const previewArtifact = activeSource === "artifact" ? artifact : null;
  const previewFilePreview = activeSource === "file" ? filePreview : null;
  const codeSource = (() => {
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
  })();
  const openFilePath = (() => {
    if (activeSource !== "file") return null;
    return filePreview?.path ?? sessionState.selectedFilePath;
  })();
  const canEdit = activeSource === "file" && filePreview?.kind === "text" && Boolean(openFilePath);

  // Edit mode (inline file editing via Monaco). Reset when the file changes
  // (render-phase adjustment, replacing a setState-in-effect).
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState<string>("");
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [syncedOpenFilePath, setSyncedOpenFilePath] = useState(openFilePath);
  if (syncedOpenFilePath !== openFilePath) {
    setSyncedOpenFilePath(openFilePath);
    setEditMode(false);
    setEditContent("");
  }
  const enterEditMode = async () => {
    if (!openFilePath) return;
    setLoadingEdit(true);
    try {
      const result = await workspaceClient.readFileText(openFilePath);
      if (result.content === null) {
        setLoadingEdit(false);
        return;
      }
      setEditContent(result.content);
      setEditMode(true);
    } catch (error) {
      console.error("[WorkspaceViewer] failed to load file for editing", error);
    }
    setLoadingEdit(false);
  };
  const exitEditMode = () => {
    setEditMode(false);
  };
  const emptyMessage = (() => {
    if (activeSource === "file" && !loadingFilePreview) return "No file selected";
    return "Workspace";
  })();
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
          {shouldShowTabs && !editMode && (
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

          {canEdit && !editMode && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={enterEditMode}
              disabled={loadingEdit}
              title="Edit file"
            >
              <Icon icon="lucide:pencil" className="mr-1 h-3.5 w-3.5" />
              {loadingEdit ? "..." : "Edit"}
            </Button>
          )}
          {editMode && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={exitEditMode} title="Stop editing">
              <Icon icon="lucide:eye" className="mr-1 h-3.5 w-3.5" />
              View
            </Button>
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

          {openFilePath && !editMode && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleOpenFile}>
              Open File
            </Button>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-testid="workspace-viewer-body">
        {editMode && openFilePath ? (
          <DiffsEditorPane
            key={openFilePath}
            filePath={openFilePath}
            initialContent={editContent}
            language={filePreview?.language ?? null}
            onSaved={exitEditMode}
          />
        ) : (
          <>
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
              <div className="flex h-full min-h-0 flex-col gap-2 py-2" data-testid="workspace-git-diff">
                {loadingGitDiff ? (
                  <div className="px-4 text-xs text-muted-foreground">Loading...</div>
                ) : gitDiff ? (
                  <>
                    {gitDiff.staged && (
                      <section className="flex min-h-0 flex-1 flex-col">
                        <h4 className="mb-1 px-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Staged
                        </h4>
                        <div className="min-h-0 flex-1">
                          <DiffsPatchPane patch={gitDiff.staged} />
                        </div>
                      </section>
                    )}
                    {gitDiff.unstaged && (
                      <section className="flex min-h-0 flex-1 flex-col">
                        <h4 className="mb-1 px-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Unstaged
                        </h4>
                        <div className="min-h-0 flex-1">
                          <DiffsPatchPane patch={gitDiff.unstaged} />
                        </div>
                      </section>
                    )}
                    {!gitDiff.staged && !gitDiff.unstaged && (
                      <div className="px-4 text-xs text-muted-foreground">No changes</div>
                    )}
                  </>
                ) : (
                  <div className="px-4 text-xs text-muted-foreground">No changes</div>
                )}
              </div>
            )}

            {paneKind === "code" && codeSource && <DiffsCodePane source={codeSource} />}

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
          </>
        )}
      </div>
    </div>
  );
}
