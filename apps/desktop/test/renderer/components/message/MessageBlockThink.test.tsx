import { describe, expect, it, vi } from "vitest";
import { render, act } from "@testing-library/react";

const configClient = {
  getSetting: vi.fn<(...args: any[]) => any>().mockResolvedValue(false),
  setSetting: vi.fn<(...args: any[]) => any>(),
};

vi.mock("#api/ConfigClient", () => ({
  createConfigClient: vi.fn<(...args: any[]) => any>(() => configClient),
}));

vi.mock("#/components/think-content", () => ({
  ThinkContent: ({
    label,
    expanded,
    thinking,
    content,
  }: {
    label: string;
    expanded?: boolean;
    thinking?: boolean;
    content?: string;
  }) => <div className="think-content-stub">{label}</div>,
}));

import MessageBlockThink from "#/components/message/MessageBlockThink";

describe("MessageBlockThink", () => {
  it("renders seconds from block.reasoning_time when present", async () => {
    const { container } = render(
      <MessageBlockThink
        block={{
          type: "reasoning_content",
          content: "thinking",
          status: "success",
          timestamp: 0,
          reasoning_time: {
            start: 1_000,
            end: 4_600,
          },
        }}
        usage={{
          reasoning_start_time: 0,
          reasoning_end_time: 0,
        }}
      />,
    );

    await act(async () => {});

    expect(container.textContent).toContain("chat.features.thoughtForSeconds:3");
  });

  it("falls back to usage reasoning time when block.reasoning_time is missing", async () => {
    const { container } = render(
      <MessageBlockThink
        block={{
          type: "reasoning_content",
          content: "thinking",
          status: "success",
          timestamp: 0,
        }}
        usage={{
          reasoning_start_time: 500,
          reasoning_end_time: 3_900,
        }}
      />,
    );

    await act(async () => {});

    expect(container.textContent).toContain("chat.features.thoughtForSeconds:3");
  });
});
