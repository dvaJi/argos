import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { DisplayAssistantMessageBlock, DisplayMessage } from "@/components/chat/messageListItems";

vi.mock("@/components/message/MessageItemUser", () => ({
  default: ({ message, isReadOnly }: any) => (
    <div className="user-item" data-read-only={String(isReadOnly)}>
      {message.id}
    </div>
  ),
}));

vi.mock("@/components/message/MessageItemAssistant", () => ({
  default: ({ message, isReadOnly }: any) => (
    <div className="assistant-item" data-read-only={String(isReadOnly)}>
      {message.id}
    </div>
  ),
}));

vi.mock("@/components/message/MessageBlockAction", () => ({
  default: ({ block }: any) => <div className="rate-limit-block-stub">{block.action_type || "unknown"}</div>,
}));

vi.mock("@/composables/message/useMessageCapture", () => ({
  useMessageCapture: () => ({
    isCapturing: false,
    captureMessage: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
  }),
}));

import MessageList from "@/components/chat/MessageList";

function createMessage(id: string, role: "user" | "assistant", orderSeq: number): DisplayMessage {
  return {
    id,
    role,
    orderSeq,
    content:
      role === "user"
        ? {
            text: id,
            files: [],
            links: [],
            search: false,
            think: false,
          }
        : [],
    timestamp: orderSeq,
    updatedAt: orderSeq,
    avatar: "",
    name: role === "user" ? "You" : "Assistant",
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
    messageType: "normal",
    summaryUpdatedAt: null,
  };
}

function createCompactionMessage(id: string, orderSeq: number, status: "compacting" | "compacted"): DisplayMessage {
  return {
    ...createMessage(id, "assistant", orderSeq),
    messageType: "compaction",
    compactionStatus: status,
  };
}

describe("MessageList", () => {
  it("renders persisted compaction messages inline with the message list", () => {
    const { container } = render(
      <MessageList
        messages={[
          createMessage("u1", "user", 1),
          createMessage("a1", "assistant", 2),
          createCompactionMessage("c1", 3, "compacted"),
          createMessage("u2", "user", 4),
        ]}
      />,
    );

    expect(container.querySelector('[data-compaction-indicator="true"]')).toBeTruthy();
    expect(container.textContent).toContain("Conversation context compacted.");
    expect(container.textContent).toContain("u1");
    expect(container.textContent).toContain("a1");
    expect(container.textContent).toContain("u2");
  });

  it("switches inline compaction copy between compacting and compacted", () => {
    const { container: compactingContainer } = render(
      <MessageList messages={[createCompactionMessage("c1", 1, "compacting")]} />,
    );
    expect(compactingContainer.textContent).toContain("Compacting conversation context...");
    const compactingIndicator = compactingContainer.querySelector('[data-compaction-indicator="true"]');
    expect(compactingIndicator?.getAttribute("data-compaction-status")).toBe("compacting");
    expect(compactingContainer.querySelector(".compaction-divider__label--compacting")).toBeTruthy();

    const { container: compactedContainer } = render(
      <MessageList messages={[createCompactionMessage("c1", 1, "compacted")]} />,
    );
    expect(compactedContainer.textContent).toContain("Conversation context compacted.");
    const compactedIndicator = compactedContainer.querySelector('[data-compaction-indicator="true"]');
    expect(compactedIndicator?.getAttribute("data-compaction-status")).toBe("compacted");
    expect(compactedContainer.querySelector(".compaction-divider__label--compacting")).toBeNull();
  });

  it("passes read-only state down to message items", () => {
    const { container } = render(
      <MessageList messages={[createMessage("u1", "user", 1), createMessage("a1", "assistant", 2)]} isReadOnly />,
    );

    const userItem = container.querySelector(".user-item");
    const assistantItem = container.querySelector(".assistant-item");
    expect(userItem?.getAttribute("data-read-only")).toBe("true");
    expect(assistantItem?.getAttribute("data-read-only")).toBe("true");
  });

  it("renders an ephemeral rate-limit block without creating an assistant item", () => {
    const { container } = render(
      <MessageList
        messages={[createMessage("u1", "user", 1)]}
        conversationId="s1"
        ephemeralRateLimitMessageId="__rate_limit__:s1:1"
        ephemeralRateLimitBlock={
          {
            type: "action",
            action_type: "rate_limit",
            status: "pending",
            timestamp: 1,
          } as DisplayAssistantMessageBlock
        }
      />,
    );

    expect(container.querySelector('[data-rate-limit-indicator="true"]')).toBeTruthy();
    const rateLimitStub = container.querySelector(".rate-limit-block-stub");
    expect(rateLimitStub?.textContent).toBe("rate_limit");
    expect(container.querySelectorAll(".assistant-item")).toHaveLength(0);
  });
});
