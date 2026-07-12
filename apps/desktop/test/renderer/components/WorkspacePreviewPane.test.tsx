import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

import WorkspacePreviewPane from "#/components/sidepanel/viewer/WorkspacePreviewPane";
import type { MarkdownLinkContext } from "#/components/markdown/linkTypes";

const createFilePreview = (overrides: Record<string, unknown> = {}) => ({
  path: "C:/repo/docs/index.html",
  relativePath: "docs/index.html",
  name: "index.html",
  mimeType: "text/html",
  kind: "html",
  content: "<html></html>",
  previewUrl: "workspace-preview://root-id/docs/index.html",
  thumbnail: "",
  language: "html",
  metadata: {
    fileName: "index.html",
    fileSize: 128,
    fileCreated: new Date("2024-01-01T00:00:00Z"),
    fileModified: new Date("2024-01-02T00:00:00Z"),
  },
  ...overrides,
});

describe("WorkspacePreviewPane", () => {
  it.each([
    ["html", "workspace-preview://root-id/docs/index.html", "allow-scripts allow-same-origin"],
    ["pdf", "workspace-preview://root-id/docs/manual.pdf", undefined],
    ["svg", "workspace-preview://root-id/docs/diagram.svg", "allow-scripts allow-same-origin"],
  ])("renders %s file previews inside a single iframe pane", (kind, previewUrl, sandbox) => {
    const { container } = render(
      <WorkspacePreviewPane
        sessionId="session-1"
        previewKind={kind}
        filePreview={createFilePreview({
          path: `C:/repo/docs/example.${kind}`,
          relativePath: `docs/example.${kind}`,
          name: `example.${kind}`,
          mimeType: kind === "pdf" ? "application/pdf" : kind === "svg" ? "image/svg+xml" : "text/html",
          kind,
          previewUrl,
        })}
      />,
    );

    const pane = screen.getByTestId("workspace-preview-pane");
    expect(pane.className.split(" ")).toEqual(
      expect.arrayContaining(["flex", "h-full", "min-h-0", "w-full", "flex-col", "overflow-hidden"]),
    );
    const iframe = container.querySelector("iframe")!;
    expect(iframe.getAttribute("src")).toBe(previewUrl);
    const kindPane = screen.getByTestId(`workspace-preview-${kind}`);
    expect(kindPane.className.split(" ")).toEqual(expect.arrayContaining(["flex-1", "min-h-0", "w-full"]));

    if (sandbox) {
      expect(iframe.getAttribute("sandbox")).toBe(sandbox);
    } else {
      expect(iframe.getAttribute("sandbox")).toBeNull();
    }
  });

  it("keeps markdown preview in the markdown pane instead of iframe", () => {
    const { container } = render(
      <WorkspacePreviewPane
        sessionId="session-1"
        previewKind="markdown"
        filePreview={createFilePreview({
          path: "C:/repo/README.md",
          relativePath: "README.md",
          name: "README.md",
          mimeType: "text/markdown",
          kind: "markdown",
          content: "# Hello",
          previewUrl: undefined,
        })}
      />,
    );

    expect(container.querySelector("iframe")).toBeNull();
    const pane = screen.getByTestId("workspace-preview-pane");
    expect(pane.className.split(" ")).toEqual(
      expect.arrayContaining(["flex", "h-full", "min-h-0", "w-full", "flex-col", "overflow-hidden"]),
    );
    expect(screen.getByTestId("workspace-preview-markdown")).toBeTruthy();
    const markdownRenderer = screen.getByTestId("markdown-renderer");
    expect(markdownRenderer.textContent).toContain("# Hello");
    expect(markdownRenderer.getAttribute("data-message-id")).toBe("C:/repo/README.md");
    expect(markdownRenderer.getAttribute("data-thread-id")).toBe("session-1");
    expect(markdownRenderer.getAttribute("data-link-source")).toBe("workspace");
    expect(markdownRenderer.getAttribute("data-link-session-id")).toBe("session-1");
    expect(markdownRenderer.getAttribute("data-source-file-path")).toBe("C:/repo/README.md");
  });

  it("keeps image preview in the image pane instead of iframe", () => {
    const { container } = render(
      <WorkspacePreviewPane
        sessionId="session-1"
        previewKind="image"
        filePreview={createFilePreview({
          path: "C:/repo/assets/logo.png",
          relativePath: "assets/logo.png",
          name: "logo.png",
          mimeType: "image/png",
          kind: "image",
          content: "imgcache://logo.png",
          previewUrl: undefined,
        })}
      />,
    );

    expect(container.querySelector("iframe")).toBeNull();
    const pane = screen.getByTestId("workspace-preview-pane");
    expect(pane.className.split(" ")).toEqual(
      expect.arrayContaining(["flex", "h-full", "min-h-0", "w-full", "flex-col", "overflow-hidden"]),
    );
    const img = screen.getByTestId("workspace-preview-image").querySelector("img")!;
    expect(img.getAttribute("src")).toBe("imgcache://logo.png");
  });

  it("passes full-height classes to HTML artifact previews", () => {
    render(
      <WorkspacePreviewPane
        sessionId="session-1"
        previewKind="html"
        artifact={{
          id: "artifact-1",
          type: "text/html",
          title: "Preview",
          content: "<html><body>Hello</body></html>",
          status: "loaded",
        }}
      />,
    );

    const artifactPane = screen.getByTestId("workspace-preview-html-artifact");
    expect(artifactPane.className.split(" ")).toEqual(
      expect.arrayContaining(["flex-1", "min-h-0", "w-full", "overflow-hidden"]),
    );
    const htmlArtifact = screen.getByTestId("html-artifact-stub");
    expect(htmlArtifact.className.split(" ")).toEqual(expect.arrayContaining(["h-full", "min-h-0", "w-full"]));
  });
});
