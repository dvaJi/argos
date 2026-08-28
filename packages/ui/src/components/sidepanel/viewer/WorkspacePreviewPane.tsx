import { useMemo } from "react";
import { Icon } from "@iconify/react";
import type { ArtifactState } from "#/stores/artifact";
import type { WorkspaceFilePreview } from "@argos/shared/presenter";
import type { WorkspacePreviewKind } from "../composables/useWorkspaceViewerModel";
import { MarkdownRenderer } from "#/components/markdown/MarkdownRenderer";
import { HTMLArtifact } from "#/components/artifacts/HTMLArtifact";
import { SvgArtifact } from "#/components/artifacts/SvgArtifact";
import { MermaidArtifact } from "#/components/artifacts/MermaidArtifact";
import { ReactArtifact } from "#/components/artifacts/ReactArtifact";
import type { MarkdownLinkContext } from "#/components/markdown/linkTypes";

interface WorkspacePreviewPaneProps {
  sessionId?: string;
  previewKind: WorkspacePreviewKind;
  artifact?: ArtifactState | null;
  filePreview?: WorkspaceFilePreview | null;
}

export function WorkspacePreviewPane({ sessionId, previewKind, artifact, filePreview }: WorkspacePreviewPaneProps) {
  const artifactBlock = useMemo(() => {
    if (!artifact) return null;
    return {
      content: artifact.content,
      artifact: { type: artifact.type, title: artifact.title },
    };
  }, [artifact]);

  const fileBlock = useMemo(() => {
    if (!filePreview) return null;
    const artifactType =
      filePreview.kind === "markdown"
        ? "text/markdown"
        : filePreview.kind === "html"
          ? "text/html"
          : filePreview.kind === "svg"
            ? "image/svg+xml"
            : filePreview.mimeType;
    return {
      content: filePreview.content,
      artifact: { type: artifactType, title: filePreview.name },
    };
  }, [filePreview]);

  const resolvedBlock = useMemo(() => artifactBlock ?? fileBlock, [artifactBlock, fileBlock]);
  const resolvedContent = useMemo(() => artifact?.content ?? filePreview?.content ?? "", [artifact, filePreview]);
  const previewSourceId = useMemo(() => artifact?.id ?? filePreview?.path, [artifact, filePreview]);
  const markdownLinkContext = useMemo<MarkdownLinkContext>(() => {
    if (filePreview) {
      return { source: "workspace", sessionId, sourceFilePath: filePreview.path };
    }
    return { source: "artifact", sessionId };
  }, [filePreview, sessionId]);

  const resolvedTitle = useMemo(() => artifact?.title ?? filePreview?.name ?? "Preview", [artifact, filePreview]);
  const imageSrc = useMemo(() => filePreview?.content || filePreview?.thumbnail || "", [filePreview]);

  const documentPreviewUrl = useMemo(() => {
    if (!filePreview?.previewUrl) return null;
    if (!["html", "pdf", "svg"].includes(previewKind)) return null;
    return filePreview.previewUrl;
  }, [filePreview, previewKind]);

  const documentPreviewSandbox = useMemo(() => {
    if (previewKind === "html" || previewKind === "svg") return "allow-scripts allow-same-origin";
    return undefined;
  }, [previewKind]);

  if (previewKind === "markdown") {
    return (
      <div className="min-h-0 w-full flex-1 overflow-auto" data-testid="workspace-preview-markdown">
        <div className="min-h-full px-4 py-4">
          <MarkdownRenderer
            content={resolvedContent}
            messageId={previewSourceId ?? ""}
            threadId={sessionId ?? ""}
            linkContext={markdownLinkContext}
          />
        </div>
      </div>
    );
  }

  if (previewKind === "image") {
    return (
      <div className="min-h-0 w-full flex-1 overflow-auto bg-muted/20" data-testid="workspace-preview-image">
        <div className="flex min-h-full items-center justify-center p-4">
          {imageSrc && (
            <img
              src={imageSrc}
              alt={resolvedTitle}
              className="max-h-full max-w-full rounded-md object-contain shadow-sm"
            />
          )}
        </div>
      </div>
    );
  }

  if (documentPreviewUrl) {
    return (
      <div className="min-h-0 w-full flex-1 overflow-hidden" data-testid={`workspace-preview-${previewKind}`}>
        <iframe
          src={documentPreviewUrl}
          className="h-full min-h-0 w-full border-0"
          sandbox={documentPreviewSandbox}
          title="File preview"
        />
      </div>
    );
  }

  if (previewKind === "html" && artifactBlock) {
    return (
      <div className="min-h-0 w-full flex-1 overflow-hidden" data-testid="workspace-preview-html-artifact">
        <HTMLArtifact block={artifactBlock} isPreview={true} viewportSize="desktop" className="h-full min-h-0 w-full" />
      </div>
    );
  }

  if (previewKind === "svg" && resolvedBlock) {
    return (
      <div className="min-h-0 w-full flex-1 overflow-hidden" data-testid="workspace-preview-svg">
        <SvgArtifact block={resolvedBlock} className="h-full min-h-0 w-full" />
      </div>
    );
  }

  if (previewKind === "mermaid" && artifactBlock) {
    return (
      <div className="min-h-0 w-full flex-1 overflow-hidden" data-testid="workspace-preview-mermaid">
        <MermaidArtifact block={artifactBlock} isPreview={true} className="h-full min-h-0 w-full" />
      </div>
    );
  }

  if (previewKind === "react" && artifactBlock) {
    return (
      <div className="min-h-0 w-full flex-1 overflow-hidden" data-testid="workspace-preview-react">
        <ReactArtifact block={artifactBlock} className="h-full min-h-0 w-full" />
      </div>
    );
  }

  return (
    <div className="min-h-0 w-full flex-1 overflow-auto px-4 py-3" data-testid="workspace-preview-raw">
      <pre className="whitespace-pre-wrap break-words text-sm leading-6">{resolvedContent}</pre>
    </div>
  );
}
