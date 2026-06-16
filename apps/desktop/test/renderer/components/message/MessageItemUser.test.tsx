import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import type { DisplayUserMessage, DisplayUserMessageMentionBlock } from "@/components/chat/messageListItems";
import type { MessageFile } from "@shared/types/agent-interface";
import MessageItemUser from "@/components/message/MessageItemUser";

const originalApi = window.api;

const getVisibleMentionLabel = (block: DisplayUserMessageMentionBlock) => {
  if (block.category === "prompts") {
    return block.id || block.content;
  }
  if (block.category === "context") {
    return block.id || block.category;
  }
  return block.content;
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === "common.expand") return "Expand";
      if (key === "common.collapse") return "Collapse";
      return key;
    },
  }),
}));

vi.mock("@iconify/react", () => ({
  Icon: () => <span className="icon-stub" />,
}));

vi.mock("@api/legacy/presenters", () => ({
  useLegacyPresenter: () => ({
    previewFile: vi.fn<(...args: any[]) => any>(),
  }),
}));

vi.mock("@/components/message/MessageInfo", () => ({
  default: () => <div className="message-info-stub" />,
}));

vi.mock("@/components/chat/ChatAttachmentItem", () => ({
  default: ({ file, onClick }: { file: MessageFile; onClick?: () => void }) => (
    <button type="button" className="attachment-stub" onClick={onClick}>
      {file.name}
    </button>
  ),
}));

vi.mock("@/components/message/MessageToolbar", () => ({
  default: ({ onEdit }: { onEdit?: () => void }) => (
    <div className="message-toolbar-stub">
      <button type="button" data-action="edit" onClick={onEdit}>
        edit
      </button>
    </div>
  ),
}));

vi.mock("@/components/message/MessageContent", () => ({
  default: ({ content }: { content: any[] }) => (
    <div className="message-content-stub text-sm whitespace-pre-wrap break-all">
      {content.map((block: any, index: number) => (
        <span key={index}>
          {block.type === "mention" ? getVisibleMentionLabel(block as DisplayUserMessageMentionBlock) : block.content}
        </span>
      ))}
    </div>
  ),
}));

vi.mock("@/components/message/MessageTextContent", () => ({
  default: ({ content }: { content: string }) => (
    <div className="message-text-stub text-sm whitespace-pre-wrap break-all">{content}</div>
  ),
}));

const createMessage = (
  overrides: Partial<DisplayUserMessage> = {},
  contentOverrides: Partial<DisplayUserMessage["content"]> = {},
): DisplayUserMessage => ({
  id: "u1",
  role: "user",
  timestamp: 1,
  avatar: "",
  name: "You",
  model_name: "",
  model_id: "",
  model_provider: "",
  status: "sent",
  error: "",
  usage: {
    context_usage: 0,
    tokens_per_second: 0,
    total_tokens: 0,
    generation_time: 0,
    first_token_time: 0,
    reasoning_start_time: 0,
    reasoning_end_time: 0,
    input_tokens: 0,
    output_tokens: 0,
  },
  conversationId: "s1",
  is_variant: 0,
  orderSeq: 1,
  content: {
    text: "short message",
    files: [],
    links: [],
    search: false,
    think: false,
    ...contentOverrides,
  },
  ...overrides,
});

const createFile = (overrides: Partial<MessageFile> = {}): MessageFile => ({
  name: "notes.txt",
  path: "/tmp/notes.txt",
  mimeType: "text/plain",
  ...overrides,
});

describe("MessageItemUser", () => {
  beforeEach(() => {
    window.api = {
      copyText: vi.fn<(...args: any[]) => any>(),
    } as typeof window.api;
  });

  afterEach(() => {
    window.api = originalApi;
    document.body.innerHTML = "";
  });

  it("does not show a collapse toggle for short text", async () => {
    render(<MessageItemUser message={createMessage()} />);

    const body = screen.getByTestId("user-message-content-body") as HTMLElement;
    expect(body.getAttribute("data-user-message-collapsible")).toBe("false");
    expect(body.getAttribute("data-user-message-expanded")).toBe("true");
    expect(screen.queryByTestId("user-message-toggle")).toBeNull();
  });

  it("collapses long plain text by default and toggles expansion", async () => {
    render(<MessageItemUser message={createMessage({}, { text: "a".repeat(700) })} />);

    const body = screen.getByTestId("user-message-content-body") as HTMLElement;
    const toggle = screen.getByTestId("user-message-toggle");

    expect(body.getAttribute("data-user-message-collapsible")).toBe("true");
    expect(body.getAttribute("data-user-message-expanded")).toBe("false");
    expect(document.querySelector(".user-message-content--clamped")).toBeTruthy();
    expect(screen.getByTestId("user-message-fade")).toBeTruthy();
    expect(toggle.textContent).toBe("Expand");

    await act(async () => {
      fireEvent.click(toggle);
    });

    expect(body.getAttribute("data-user-message-expanded")).toBe("true");
    expect(screen.queryByTestId("user-message-fade")).toBeNull();
    expect(screen.getByTestId("user-message-toggle").textContent).toBe("Collapse");

    await act(async () => {
      fireEvent.click(screen.getByTestId("user-message-toggle"));
    });

    expect(body.getAttribute("data-user-message-expanded")).toBe("false");
  });

  it("keeps structured user content rendering while collapsed", async () => {
    const { container } = render(
      <MessageItemUser
        message={createMessage(
          {},
          {
            text: "",
            content: [
              {
                type: "text",
                content: "x".repeat(650),
              },
              {
                type: "mention",
                content: '{"messages":[]}',
                id: "prompt-name",
                category: "prompts",
              },
              {
                type: "code",
                content: "const answer = 42;",
                language: "typescript",
              },
            ],
          },
        )}
      />,
    );

    expect(screen.getByTestId("user-message-toggle")).toBeTruthy();
    expect(container.textContent).toContain("prompt-name");
    expect(container.textContent).toContain("const answer = 42;");
  });

  it("keeps attachments visible when long text collapses", async () => {
    render(<MessageItemUser message={createMessage({}, { text: "b".repeat(700), files: [createFile()] })} />);

    expect(screen.getAllByText("notes.txt")).toHaveLength(1);
    expect(screen.getByTestId("user-message-toggle")).toBeTruthy();
  });

  it("shows full textarea content in edit mode even when the message is collapsible", async () => {
    render(<MessageItemUser message={createMessage({}, { text: "c".repeat(700) })} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId("edit-action"));
    });
    await act(async () => {});

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    expect(screen.queryByTestId("user-message-content-body")).toBeNull();
    expect(textarea.value).toBe("c".repeat(700));
  });

  it("re-evaluates collapse state when content length drops below the collapse threshold", async () => {
    const { rerender } = render(<MessageItemUser message={createMessage({}, { text: "d".repeat(700) })} />);

    expect(screen.getByTestId("user-message-toggle")).toBeTruthy();

    rerender(<MessageItemUser message={createMessage({}, { text: "short again" })} />);
    await act(async () => {});

    const body = screen.getByTestId("user-message-content-body") as HTMLElement;
    expect(body.getAttribute("data-user-message-collapsible")).toBe("false");
    expect(body.getAttribute("data-user-message-expanded")).toBe("true");
    expect(screen.queryByTestId("user-message-toggle")).toBeNull();
  });
});
