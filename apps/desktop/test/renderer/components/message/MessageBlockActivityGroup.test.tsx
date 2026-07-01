import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import MessageBlockActivityGroup from "@/components/message/MessageBlockActivityGroup";
import type { DisplayAssistantMessageBlock, DisplayMessageUsage } from "@/components/chat/messageListItems";

const usage: DisplayMessageUsage = {
  context_usage: 0,
  tokens_per_second: 0,
  total_tokens: 0,
  generation_time: 0,
  first_token_time: 0,
  reasoning_start_time: 0,
  reasoning_end_time: 0,
  input_tokens: 0,
  output_tokens: 0,
};

const blocks: DisplayAssistantMessageBlock[] = [
  {
    type: "reasoning_content",
    content: "thinking",
    status: "success",
    timestamp: 1_000,
  },
  {
    type: "tool_call",
    status: "success",
    timestamp: 2_000,
    tool_call: {
      id: "tc1",
      name: "shell_command",
    },
  },
];

const mountGroup = () =>
  render(
    <MessageBlockActivityGroup
      blocks={blocks}
      messageId="m1"
      threadId="s1"
      usage={usage}
      durationMs={65_000}
      reasoningCount={1}
      toolCallCount={1}
    />,
  );

describe("MessageBlockActivityGroup", () => {
  it("starts collapsed with duration and activity counts in the title", () => {
    mountGroup();

    const toggle = screen.getByTestId("activity-group-toggle");
    expect(toggle.textContent).toContain("Worked for 1m 5s · 1 thought(s) · 1 tool call(s)");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    const bodyShell = screen.getByTestId("activity-group-body-shell");
    expect(bodyShell.getAttribute("aria-hidden")).toBe("true");
    expect(bodyShell.getAttribute("inert")).toBeDefined();
    expect(bodyShell.className).toContain("grid-rows-[0fr]");
    expect(screen.getByTestId("think-block")).toBeTruthy();
    expect(screen.getByTestId("tool-block")).toBeTruthy();
  });

  it("toggles expanded state and shows the original activity blocks", async () => {
    mountGroup();

    const toggle = screen.getByTestId("activity-group-toggle");
    await act(async () => {
      fireEvent.click(toggle);
    });

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const bodyShell = screen.getByTestId("activity-group-body-shell");
    expect(bodyShell.getAttribute("aria-hidden")).toBe("false");
    expect(bodyShell.getAttribute("inert")).toBeNull();
    expect(bodyShell.className).toContain("grid-rows-[1fr]");
    expect(screen.getByTestId("think-block").textContent).toBe("thinking");
    expect(screen.getByTestId("tool-block").textContent).toBe("shell_command");

    await act(async () => {
      fireEvent.click(toggle);
    });

    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(bodyShell.getAttribute("aria-hidden")).toBe("true");
    expect(bodyShell.getAttribute("inert")).toBeDefined();
  });

  it("does not persist expanded state across remounts", async () => {
    const { unmount } = mountGroup();
    const toggle = screen.getByTestId("activity-group-toggle");
    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    unmount();
    mountGroup();

    expect(screen.getByTestId("activity-group-toggle").getAttribute("aria-expanded")).toBe("false");
  });
});
