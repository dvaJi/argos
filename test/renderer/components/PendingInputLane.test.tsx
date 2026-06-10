import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import type { PendingSessionInputRecord } from "@shared/types/agent-interface";

vi.mock("@iconify/react", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}));

vi.mock("@shadcn/components/ui/button", () => ({
  Button: ({ disabled, children, onClick, ...props }: any) => (
    <button disabled={disabled} onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

vi.mock("vuedraggable", () => ({
  default: ({ list, disabled, children }: any) => (
    <div data-testid="draggable" data-disabled={disabled ? "true" : "false"}>
      {list.map((element: any) => (
        <div key={element.id}>{typeof children === "function" ? children({ element }) : null}</div>
      ))}
    </div>
  ),
}));

import PendingInputLane from "@/components/chat/PendingInputLane";

function buildPendingInput(
  id: string,
  mode: "queue" | "steer",
  overrides: Partial<PendingSessionInputRecord> = {},
): PendingSessionInputRecord {
  return {
    id,
    sessionId: "s1",
    mode,
    state: "pending",
    payload: {
      text: `${mode}-${id}`,
      files: [],
    },
    queueOrder: mode === "queue" ? Number(id.replace(/\D+/g, "") || "1") : null,
    claimedAt: null,
    consumedAt: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("PendingInputLane", () => {
  it("renders a single pending rail with compact rows for steer and queue items", () => {
    const { container } = render(
      <PendingInputLane
        steerItems={[buildPendingInput("steer-1", "steer")]}
        queueItems={[buildPendingInput("queue-1", "queue"), buildPendingInput("queue-2", "queue")]}
      />,
    );

    expect(container.querySelectorAll('[data-testid="pending-rail"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-testid="pending-row"]')).toHaveLength(3);

    const queueMain = container.querySelector('[data-mode="queue"] [data-testid="pending-row-main"] span');
    expect(queueMain?.classList.contains("truncate")).toBe(true);

    const steerText = container.querySelector('[data-mode="steer"] [title]');
    expect(steerText?.classList.contains("truncate")).toBe(true);
  });

  it("shows inline file badges and becomes internally scrollable when more than three items exist", () => {
    const { container } = render(
      <PendingInputLane
        steerItems={[buildPendingInput("steer-1", "steer")]}
        queueItems={[
          buildPendingInput("queue-1", "queue", {
            payload: {
              text: "queue-1",
              files: [{ name: "a.txt", path: "/a.txt", mimeType: "text/plain", size: 1 }],
            },
          }),
          buildPendingInput("queue-2", "queue"),
          buildPendingInput("queue-3", "queue"),
          buildPendingInput("queue-4", "queue"),
        ]}
      />,
    );

    const list = container.querySelector('[data-testid="pending-rail-list"]')!;
    expect(list.getAttribute("data-scrollable")).toBe("true");
    expect(container).toHaveTextContent("1 files");
  });

  it("expands only the active queue item for inline editing and disables drag while editing", async () => {
    const { container } = render(
      <PendingInputLane
        steerItems={[]}
        queueItems={[buildPendingInput("queue-1", "queue"), buildPendingInput("queue-2", "queue")]}
      />,
    );

    const mainButtons = container.querySelectorAll('[data-testid="pending-row-main"]');
    await act(async () => {
      fireEvent.click(mainButtons[0]);
    });

    expect(container.querySelectorAll('[data-testid="pending-edit-textarea"]')).toHaveLength(1);
    const queueRows = container.querySelectorAll('[data-mode="queue"]');
    expect(queueRows[0].getAttribute("data-editing")).toBe("true");
    expect(queueRows[1].getAttribute("data-editing")).toBe("false");
    expect(container.querySelector('[data-testid="draggable"]')!.getAttribute("data-disabled")).toBe("true");
  });

  it("shows resume queue action only when requested and emits the event", async () => {
    const onResumeQueue = vi.fn();
    const { container } = render(
      <PendingInputLane
        steerItems={[]}
        queueItems={[buildPendingInput("queue-1", "queue")]}
        showResumeQueue={true}
        onResumeQueue={onResumeQueue}
      />,
    );

    const buttons = container.querySelectorAll("button");
    const resumeButton = Array.from(buttons).find((button) => button.textContent === "Resume queue");

    expect(resumeButton).toBeTruthy();
    await act(async () => {
      fireEvent.click(resumeButton!);
    });
    expect(onResumeQueue).toHaveBeenCalledTimes(1);
  });
});
