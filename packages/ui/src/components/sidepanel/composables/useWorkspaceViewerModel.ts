import { useMemo } from "react";
import type { ArtifactState } from "#/stores/artifact";
import type { WorkspaceFilePreview, WorkspaceViewMode } from "@argos/shared/presenter";

export type WorkspaceViewerSource = "artifact" | "file" | "git-diff" | null;
export type WorkspaceViewerPane = "empty" | "git-diff" | "code" | "preview" | "info";
export type WorkspacePreviewKind = "markdown" | "html" | "pdf" | "svg" | "image" | "mermaid" | "react" | "raw";

type SessionStateLike = {
  selectedArtifactContext: unknown;
  selectedFilePath: string | null;
  selectedDiffPath: string | null;
  viewMode: WorkspaceViewMode;
};

interface UseWorkspaceViewerModelOptions {
  artifact: ArtifactState | null;
  filePreview: WorkspaceFilePreview | null;
  sessionState: SessionStateLike;
}

export function useWorkspaceViewerModel(options: UseWorkspaceViewerModelOptions) {
  const activeSource = useMemo<WorkspaceViewerSource>(() => {
    if (options.sessionState.selectedDiffPath) {
      return "git-diff";
    }
    if (options.sessionState.selectedFilePath) {
      return "file";
    }
    if (options.sessionState.selectedArtifactContext && options.artifact) {
      return "artifact";
    }
    return null;
  }, [
    options.sessionState.selectedDiffPath,
    options.sessionState.selectedFilePath,
    options.sessionState.selectedArtifactContext,
    options.artifact,
  ]);

  const artifactPreviewKind = useMemo<WorkspacePreviewKind>(() => {
    switch (options.artifact?.type) {
      case "text/markdown":
        return "markdown";
      case "text/html":
        return "html";
      case "image/svg+xml":
        return "svg";
      case "application/vnd.ant.mermaid":
        return "mermaid";
      case "application/vnd.ant.react":
        return "react";
      default:
        return "raw";
    }
  }, [options.artifact?.type]);

  const filePreviewKind = useMemo<WorkspacePreviewKind | null>(() => {
    switch (options.filePreview?.kind) {
      case "markdown":
        return "markdown";
      case "html":
        return "html";
      case "pdf":
        return "pdf";
      case "svg":
        return "svg";
      case "image":
        return "image";
      default:
        return null;
    }
  }, [options.filePreview?.kind]);

  const availableTabs = useMemo<WorkspaceViewMode[]>(() => {
    if (activeSource === "artifact") {
      return ["preview", "code"];
    }

    if (activeSource !== "file" || !options.filePreview) {
      return [];
    }

    switch (options.filePreview.kind) {
      case "markdown":
      case "html":
      case "svg":
        return ["preview", "code"];
      case "text":
        return ["code"];
      case "pdf":
        return ["preview"];
      default:
        return [];
    }
  }, [activeSource, options.filePreview]);

  const effectiveViewMode = useMemo<WorkspaceViewMode>(() => {
    if (availableTabs.includes(options.sessionState.viewMode)) {
      return options.sessionState.viewMode;
    }

    return availableTabs[0] ?? "preview";
  }, [availableTabs, options.sessionState.viewMode]);

  const paneKind = useMemo<WorkspaceViewerPane>(() => {
    if (activeSource === null) {
      return "empty";
    }

    if (activeSource === "git-diff") {
      return "git-diff";
    }

    if (activeSource === "artifact") {
      if (effectiveViewMode === "code") {
        return "code";
      }

      return options.artifact?.type === "application/vnd.ant.code" ? "code" : "preview";
    }

    if (!options.filePreview) {
      return "empty";
    }

    switch (options.filePreview.kind) {
      case "text":
        return "code";
      case "markdown":
      case "html":
      case "pdf":
      case "svg":
      case "image":
        return effectiveViewMode === "code" ? "code" : "preview";
      case "binary":
      default:
        return "info";
    }
  }, [activeSource, effectiveViewMode, options.artifact, options.filePreview]);

  const previewKind = useMemo<WorkspacePreviewKind | null>(() => {
    if (paneKind !== "preview") {
      return null;
    }

    if (activeSource === "artifact") {
      return artifactPreviewKind;
    }

    return filePreviewKind;
  }, [paneKind, activeSource, artifactPreviewKind, filePreviewKind]);

  const shouldShowTabs = useMemo(() => availableTabs.length > 1, [availableTabs]);

  return {
    activeSource,
    availableTabs,
    effectiveViewMode,
    paneKind,
    previewKind,
    shouldShowTabs,
  };
}
