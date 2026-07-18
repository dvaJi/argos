import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MessageBlockContent } from "#/components/message/MessageBlockContent";
import type { DisplayAssistantMessageBlock } from "#/components/chat/messageListItems";
import type { MarkdownLinkContext } from "#/components/markdown/linkTypes";

const { syncArtifactMock, completeArtifactMock, getSearchResultsMock } = vi.hoisted(() => ({
  syncArtifactMock: vi.fn<(...args: any[]) => any>(),
  completeArtifactMock: vi.fn<(...args: any[]) => any>(),
  getSearchResultsMock: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
}));

vi.mock("#/stores/artifact", () => ({
  useArtifactStore: () => ({
    syncArtifact: syncArtifactMock,
    completeArtifact: completeArtifactMock,
  }),
}));

vi.mock("#api/presenterBridge", () => ({
  useLegacyPresenter: () => ({
    getSearchResults: getSearchResultsMock,
  }),
}));

vi.mock("#/components/artifacts/ArtifactThinking", () => ({
  default: () => <div className="artifact-thinking-stub" />,
}));

vi.mock("#/components/artifacts/ArtifactPreview", () => ({
  default: ({ block }: { block: any }) => <div className="artifact-preview-stub">{block.artifact?.title}</div>,
}));

vi.mock("#/components/artifacts/ToolCallPreview", () => ({
  default: () => <div className="tool-preview-stub" />,
}));

vi.mock("#/components/markdown/MarkdownRenderer", () => ({
  default: ({
    content,
    messageId,
    threadId,
    smoothStreaming,
    linkContext,
  }: {
    content?: string;
    messageId?: string;
    threadId?: string;
    smoothStreaming?: boolean;
    linkContext?: MarkdownLinkContext;
  }) => (
    <div
      className="markdown-stub"
      data-message-id={messageId}
      data-thread-id={threadId}
      data-link-source={linkContext?.source}
      data-link-session-id={linkContext?.sessionId}
      data-smooth-streaming={String(smoothStreaming)}
    >
      {content}
    </div>
  ),
}));

const createBlock = (overrides: Partial<DisplayAssistantMessageBlock> = {}): DisplayAssistantMessageBlock => ({
  type: "content",
  status: "success",
  timestamp: Date.now(),
  content: "",
  ...overrides,
});

describe("MessageBlockContent", () => {
  beforeEach(() => {
    syncArtifactMock.mockReset();
    completeArtifactMock.mockReset();
    getSearchResultsMock.mockReset();
    getSearchResultsMock.mockResolvedValue([]);
  });

  it("syncs loading artifact for unclosed artifact content", async () => {
    const { container } = render(
      <MessageBlockContent
        block={createBlock({
          status: "loading",
          content:
            '<antArtifact type="application/vnd.ant.code" identifier="artifact-1" title="Example" language="ts">const answer = 42',
        })}
        messageId="m1"
        threadId="s1"
      />,
    );

    await act(async () => {});

    expect(container.textContent).toContain("Example");
    expect(syncArtifactMock).toHaveBeenCalledWith(
      {
        id: "artifact-1",
        type: "application/vnd.ant.code",
        title: "Example",
        language: "ts",
        content: "const answer = 42",
        status: "loading",
      },
      "m1",
      "s1",
    );
    expect(completeArtifactMock).not.toHaveBeenCalled();
  });

  it("completes loaded artifact for closed artifact content", async () => {
    const { container } = render(
      <MessageBlockContent
        block={createBlock({
          status: "success",
          content: '<antArtifact type="text/markdown" identifier="artifact-2" title="Readme"># Hello</antArtifact>',
        })}
        messageId="m2"
        threadId="s2"
      />,
    );

    await act(async () => {});

    expect(container.textContent).toContain("Readme");
    expect(completeArtifactMock).toHaveBeenCalledWith(
      {
        id: "artifact-2",
        type: "text/markdown",
        title: "Readme",
        language: undefined,
        content: "# Hello",
        status: "loaded",
      },
      "m2",
      "s2",
    );
  });

  it("passes message and thread ids to MarkdownRenderer for text parts", async () => {
    render(
      <MessageBlockContent
        block={createBlock({
          status: "success",
          content: "plain markdown content",
        })}
        messageId="m3"
        threadId="s3"
      />,
    );

    await act(async () => {});

    const markdown = screen.getByTestId("markdown-stub") as HTMLElement;
    expect(markdown).toBeTruthy();
    const stub = document.querySelector(".markdown-stub") as HTMLElement;
    expect(stub.getAttribute("data-message-id")).toBe("m3");
    expect(stub.getAttribute("data-thread-id")).toBe("s3");
    expect(stub.getAttribute("data-link-source")).toBe("chat");
    expect(stub.getAttribute("data-link-session-id")).toBe("s3");
    expect(stub.textContent).toContain("plain markdown content");
  });

  it("disables smooth streaming for completed content blocks", async () => {
    render(
      <MessageBlockContent
        block={createBlock({
          status: "success",
          content: "completed markdown content",
        })}
        messageId="m4"
        threadId="s4"
      />,
    );

    await act(async () => {});

    const stub = document.querySelector(".markdown-stub") as HTMLElement;
    expect(stub.getAttribute("data-smooth-streaming")).toBe("false");
  });

  it.each(["pending", "loading"] as const)("enables smooth streaming for %s content blocks", async (status) => {
    render(
      <MessageBlockContent
        block={createBlock({
          status,
          content: `${status} markdown content`,
        })}
        messageId="m5"
        threadId="s5"
      />,
    );

    await act(async () => {});

    const stub = document.querySelector(".markdown-stub") as HTMLElement;
    expect(stub.getAttribute("data-smooth-streaming")).toBe("true");
  });
});
