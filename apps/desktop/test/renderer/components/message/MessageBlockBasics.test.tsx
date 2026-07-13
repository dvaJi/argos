import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import MessageBlockAction from "#/components/message/MessageBlockAction";
import MessageBlockError from "#/components/message/MessageBlockError";
import MessageBlockPlan from "#/components/message/MessageBlockPlan";
import MessageBlockQuestionRequest from "#/components/message/MessageBlockQuestionRequest";
import ChatToolInteractionOverlay from "#/components/chat/ChatToolInteractionOverlay";
import type { DisplayAssistantMessageBlock } from "#/components/chat/messageListItems";

vi.mock("@iconify/react", () => ({
  Icon: () => null,
}));

vi.mock("#shadcn/components/ui/button", () => ({
  Button: ({ children, onClick, ...props }: Record<string, any>) => (
    <button type="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

const createBlock = (overrides: Partial<DisplayAssistantMessageBlock> = {}): DisplayAssistantMessageBlock => ({
  type: "action",
  status: "success",
  timestamp: Date.now(),
  content: "",
  ...overrides,
});

describe("MessageBlock basics", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.electron = {
      ipcRenderer: {
        invoke: vi.fn<(...args: any[]) => any>(),
      },
    } as never;
  });

  it("emits continue for needContinue action", async () => {
    const onContinue = vi.fn<(...args: any[]) => any>();
    render(
      <MessageBlockAction
        messageId="m1"
        conversationId="s1"
        block={createBlock({
          extra: {
            needContinue: true,
          },
          content: "continue.prompt",
        })}
        onContinue={onContinue}
      />,
    );

    const button = screen.getByRole("button");
    await act(async () => {
      fireEvent.click(button);
    });

    expect(onContinue).toHaveBeenCalledWith("s1", "m1");
  });

  it("renders a compact rate limit status block", () => {
    const { container } = render(
      <MessageBlockAction
        messageId="m1"
        conversationId="s1"
        block={createBlock({
          action_type: "rate_limit",
          timestamp: Date.now(),
        })}
      />,
    );

    expect(container.querySelector('[data-rate-limit-block="true"]')).toBeTruthy();
    expect(container.textContent).toContain("chat.messages.rateLimitCompactLoading");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("translates skill draft question keys with the draft name", () => {
    const { container } = render(
      <MessageBlockQuestionRequest
        block={createBlock({
          action_type: "question_request",
          content: "",
          extra: {
            questionText: "chat.skillDraft.confirmationQuestion",
            questionOptions: JSON.stringify([
              { label: "chat.skillDraft.actions.view" },
              { label: "chat.skillDraft.actions.install" },
              { label: "chat.skillDraft.actions.discard" },
            ]),
            answerText: "chat.skillDraft.actions.install",
            skillDraftName: "draft-skill",
          },
        })}
      />,
    );

    expect(container.textContent).toContain("Generated skill draft: draft-skill");
    expect(container.textContent).toContain("View contents");
    expect(container.textContent).toContain("Install as Skill");
    expect(container.textContent).toContain("Discard");
  });

  it("renders skill draft preview and emits the raw action key from the overlay", async () => {
    const onRespond = vi.fn<(...args: any[]) => any>();
    const { container } = render(
      <ChatToolInteractionOverlay
        interaction={{
          messageId: "m1",
          toolCallId: "tc1",
          actionType: "question_request",
          toolName: "skill_manage",
          toolArgs: "{}",
          block: createBlock({
            action_type: "question_request",
            status: "pending",
            extra: {
              questionHeader: "chat.skillDraft.confirmationTitle",
              questionText: "chat.skillDraft.confirmationQuestion",
              questionOptions: [
                { label: "chat.skillDraft.actions.install" },
                { label: "chat.skillDraft.actions.discard" },
              ],
              questionCustom: false,
              skillDraftAction: "confirm",
              skillDraftName: "draft-skill",
              skillDraftPreview: "# Draft body",
            },
          }),
        }}
        onRespond={onRespond}
      />,
    );

    expect(container.textContent).toContain("Generated skill draft: draft-skill");
    expect(container.textContent).toContain("Draft content preview");
    expect(container.textContent).toContain("# Draft body");
    expect(container.textContent).toContain("Install as Skill");

    const installButton = screen
      .getAllByRole("button")
      .find((button) => button.textContent?.includes("Install as Skill"));
    expect(installButton).toBeTruthy();
    await act(async () => {
      fireEvent.click(installButton!);
    });

    expect(onRespond).toHaveBeenCalledWith([
      { kind: "question_option", optionLabel: "chat.skillDraft.actions.install" },
    ]);
  });

  it("renders question request content and answer", () => {
    const { container } = render(
      <MessageBlockQuestionRequest
        block={createBlock({
          action_type: "question_request",
          content: "Question body",
          extra: {
            questionText: "Pick one",
            questionOptions: [{ label: "A", description: "Option A" }, { label: "B" }],
            answerText: "A",
          },
        })}
      />,
    );

    expect(container.textContent).toContain("Pick one");
    expect(container.textContent).toContain("A");
    expect(container.textContent).toContain("B");
    expect(container.textContent).toContain("components.messageBlockQuestionRequest.answerLabel");
  });

  it("renders plan summary from plan entries", () => {
    const { container } = render(
      <MessageBlockPlan
        block={createBlock({
          type: "plan",
          extra: {
            plan_entries: [
              { step: "Inspect runtime", status: "completed" },
              { step: "Write tests", status: "pending" },
            ],
          },
        })}
      />,
    );

    expect(container.textContent).toContain("Plan");
    expect(container.textContent).toContain("1/2 Completed");
    expect(container.textContent).toContain("Inspect runtime");
    expect(container.textContent).toContain("Write tests");
    expect(container.querySelector('[aria-label="Completed: Inspect runtime"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Pending: Write tests"]')).toBeTruthy();
  });

  it("expands error details and explanation", async () => {
    const { container } = render(
      <MessageBlockError
        block={createBlock({
          type: "error",
          content: "HTTP 429 from upstream",
        })}
      />,
    );

    const group = container.querySelector(".group")!;
    await act(async () => {
      fireEvent.click(group);
    });

    expect(container.textContent).toContain("common.error.requestFailed");
    expect(container.textContent).toContain("common.error.causeOfError");
    expect(container.textContent).toContain("common.error.error429");
  });
});
