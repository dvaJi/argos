import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import MessageItemAssistant from "@/components/message/MessageItemAssistant";
import type { DisplayAssistantMessage, DisplayAssistantMessageBlock } from "@/components/chat/messageListItems";

vi.mock("@/stores/uiSettingsStore", () => ({
  useUiSettingsStore: () => ({}),
}));

vi.mock("@/stores/theme", () => ({
  useThemeStore: () => ({
    isDark: false,
  }),
}));

vi.mock("@shadcn/components/ui/spinner", () => ({
  Spinner: () => <div data-testid="spinner" />,
}));

vi.mock("@shadcn/components/ui/button", () => ({
  Button: ({ children, ...props }: Record<string, any>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@shadcn/components/ui/dialog", () => ({
  Dialog: ({ children }: Record<string, any>) => <div>{children}</div>,
  DialogContent: ({ children }: Record<string, any>) => <div>{children}</div>,
  DialogDescription: ({ children }: Record<string, any>) => <div>{children}</div>,
  DialogFooter: ({ children }: Record<string, any>) => <div>{children}</div>,
  DialogHeader: ({ children }: Record<string, any>) => <div>{children}</div>,
  DialogTitle: ({ children }: Record<string, any>) => <div>{children}</div>,
}));

vi.mock("@shadcn/components/ui/context-menu", () => ({
  ContextMenu: ({ children }: Record<string, any>) => <div>{children}</div>,
  ContextMenuContent: ({ children }: Record<string, any>) => <div>{children}</div>,
  ContextMenuItem: ({ children }: Record<string, any>) => <div>{children}</div>,
  ContextMenuSeparator: () => <div />,
  ContextMenuTrigger: ({ children }: Record<string, any>) => <div>{children}</div>,
}));

vi.mock("@/components/message/ModelIcon", () => ({
  default: ({ children }: Record<string, any>) => <div>{children}</div>,
}));

vi.mock("@/components/message/MessageInfo", () => ({
  default: ({ children }: Record<string, any>) => <div>{children}</div>,
}));

vi.mock("@/components/message/MessageBlockContent", () => ({
  default: ({ children }: Record<string, any>) => <div>{children}</div>,
}));

vi.mock("@/components/message/MessageBlockThink", () => ({
  default: ({ children }: Record<string, any>) => <div>{children}</div>,
}));

vi.mock("@/components/message/MessageBlockToolCall", () => ({
  default: ({ children }: Record<string, any>) => <div>{children}</div>,
}));

vi.mock("@/components/message/MessageBlockError", () => ({
  default: ({ children }: Record<string, any>) => <div>{children}</div>,
}));

vi.mock("@/components/message/MessageBlockQuestionRequest", () => ({
  default: ({ children }: Record<string, any>) => <div>{children}</div>,
}));

vi.mock("@/components/message/MessageToolbar", () => ({
  default: ({ children }: Record<string, any>) => <div>{children}</div>,
}));

vi.mock("@/components/message/MessageBlockAction", () => ({
  default: ({ children }: Record<string, any>) => <div>{children}</div>,
}));

vi.mock("@/components/message/MessageBlockImage", () => ({
  default: ({ children }: Record<string, any>) => <div>{children}</div>,
}));

vi.mock("@/components/message/MessageBlockAudio", () => ({
  default: ({ children }: Record<string, any>) => <div>{children}</div>,
}));

vi.mock("@/components/message/MessageBlockPlan", () => ({
  default: ({ children }: Record<string, any>) => <div>{children}</div>,
}));

vi.mock("@/components/message/MessageBlockVideo", () => ({
  default: ({ block }: { block?: any }) => <div data-testid="video-block" />,
}));

vi.mock("@/components/message/MessageBlockActivityGroup", () => ({
  default: ({ blocks }: { blocks: any[] }) => (
    <div data-testid="activity-group" data-block-count={String(blocks.length)}>
      activity
    </div>
  ),
}));

const createMessage = (
  status: "sent" | "pending" | "error",
  content: DisplayAssistantMessage["content"],
): DisplayAssistantMessage => ({
  id: "m1",
  role: "assistant",
  timestamp: 1,
  updatedAt: 1,
  avatar: "",
  name: "Assistant",
  model_name: "GPT-4",
  model_id: "gpt-4",
  model_provider: "openai",
  status,
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
  content,
});

const createVideoLikeImageBlock = (
  overrides: Partial<DisplayAssistantMessageBlock> = {},
): DisplayAssistantMessageBlock => ({
  type: "image",
  status: "success",
  timestamp: 1,
  image_data: {
    data: "https://example.com/sample.png",
    mimeType: "image/png",
  },
  ...overrides,
});

const createThinkingBlock = (overrides: Partial<DisplayAssistantMessageBlock> = {}): DisplayAssistantMessageBlock => ({
  type: "reasoning_content",
  content: "thinking",
  status: "success",
  timestamp: 1,
  ...overrides,
});

const createToolCallBlock = (overrides: Partial<DisplayAssistantMessageBlock> = {}): DisplayAssistantMessageBlock => ({
  type: "tool_call",
  status: "success",
  timestamp: 2,
  tool_call: {
    id: "tc1",
    name: "read_file",
  },
  ...overrides,
});

describe("MessageItemAssistant", () => {
  it("does not render a spinner for empty non-pending assistant messages", () => {
    render(<MessageItemAssistant message={createMessage("error", [])} isCapturingImage={false} />);

    expect(screen.queryByTestId("spinner")).toBeNull();
  });

  it("renders a spinner for empty pending assistant messages", () => {
    render(<MessageItemAssistant message={createMessage("pending", [])} isCapturingImage={false} />);

    expect(screen.getByTestId("spinner")).toBeTruthy();
  });

  it("renders video blocks from legacy content urls", () => {
    render(
      <MessageItemAssistant
        message={createMessage("sent", [
          createVideoLikeImageBlock({
            content: "https://example.com/media/generated-video.mp4?download=1",
            image_data: undefined,
          }),
        ])}
        isCapturingImage={false}
      />,
    );

    expect(screen.getByTestId("video-block")).toBeTruthy();
  });

  it("does not classify non-video urls as video blocks when extensions only appear in query text", () => {
    render(
      <MessageItemAssistant
        message={createMessage("sent", [
          createVideoLikeImageBlock({
            image_data: {
              data: "https://example.com/assets/preview.png?redirect=.mp4",
              mimeType: "image/png",
            },
          }),
        ])}
        isCapturingImage={false}
      />,
    );

    expect(screen.queryByTestId("video-block")).toBeNull();
  });

  it("groups completed assistant activity blocks after the turn is settled", () => {
    render(
      <MessageItemAssistant
        message={createMessage("sent", [createThinkingBlock(), createToolCallBlock()])}
        isCapturingImage={false}
        isInGeneratingThread={false}
      />,
    );

    expect(screen.getByTestId("activity-group")).toBeTruthy();
    expect(screen.getByTestId("activity-group").getAttribute("data-block-count")).toBe("2");
    expect(screen.queryByTestId("think-block")).toBeNull();
    expect(screen.queryByTestId("tool-block")).toBeNull();
  });

  it("does not group activity while the assistant message is pending", () => {
    render(
      <MessageItemAssistant
        message={createMessage("pending", [createThinkingBlock(), createToolCallBlock()])}
        isCapturingImage={false}
        isInGeneratingThread={true}
      />,
    );

    expect(screen.queryByTestId("activity-group")).toBeNull();
  });

  it("does not group sent activity while the thread is still generating", () => {
    render(
      <MessageItemAssistant
        message={createMessage("sent", [createThinkingBlock(), createToolCallBlock()])}
        isCapturingImage={false}
        isInGeneratingThread={true}
      />,
    );

    expect(screen.queryByTestId("activity-group")).toBeNull();
  });

  it("does not group pending activity when the thread is idle", () => {
    render(
      <MessageItemAssistant
        message={createMessage("pending", [createThinkingBlock(), createToolCallBlock()])}
        isCapturingImage={false}
        isInGeneratingThread={false}
      />,
    );

    expect(screen.queryByTestId("activity-group")).toBeNull();
  });

  it("excludes internal tool calls from activity groups", () => {
    render(
      <MessageItemAssistant
        message={createMessage("sent", [
          createThinkingBlock(),
          createToolCallBlock({
            extra: {
              internalTool: true,
            },
            tool_call: {
              id: "tc-plan",
              name: "update_plan",
            },
          }),
        ])}
        isCapturingImage={false}
        isInGeneratingThread={false}
      />,
    );

    expect(screen.getByTestId("activity-group")).toBeTruthy();
    expect(screen.getByTestId("activity-group").getAttribute("data-block-count")).toBe("1");
    expect(screen.queryByTestId("tool-block")).toBeNull();
  });
});
