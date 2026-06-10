import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import WorkspaceFileNode from "@/components/workspace/WorkspaceFileNode";
import { CHAT_INPUT_WORKSPACE_ITEM_MIME } from "@/lib/chatInputWorkspaceReference";

vi.mock("@iconify/react", () => ({
  Icon: () => null,
}));

vi.mock("@api/legacy/presenters", () => ({
  useLegacyPresenter: () => ({
    openFile: vi.fn(),
    revealFileInFolder: vi.fn(),
  }),
}));

describe("WorkspaceFileNode drag support", () => {
  const mountNode = (node = { name: "App.vue", path: "/repo/src/App.vue", isDirectory: false }) => {
    const onInsertPath = vi.fn();
    const onAppendPath = vi.fn();
    const result = render(
      <WorkspaceFileNode node={node} depth={0} onInsertPath={onInsertPath} onAppendPath={onAppendPath} />,
    );
    return { ...result, onInsertPath, onAppendPath };
  };

  it("writes workspace drag payload on dragstart", async () => {
    const { container } = mountNode();

    const dataTransfer = {
      setData: vi.fn(),
      effectAllowed: "all",
    } as unknown as DataTransfer;

    const draggable = container.querySelector('button[draggable="true"]')!;
    await act(async () => {
      fireEvent.dragStart(draggable, { dataTransfer });
    });

    expect((dataTransfer as any).setData).toHaveBeenCalledWith(
      CHAT_INPUT_WORKSPACE_ITEM_MIME,
      JSON.stringify({
        path: "/repo/src/App.vue",
        isDirectory: false,
      }),
    );
    expect((dataTransfer as any).effectAllowed).toBe("copy");
  });

  it("emits insert-path from the context-menu insert action", async () => {
    const { onInsertPath } = mountNode();
    const insertAction = screen
      .getAllByRole("button")
      .find((button) => button.textContent?.includes("chat.workspace.files.contextMenu.insertPath"));

    expect(insertAction).toBeTruthy();
    await act(async () => {
      fireEvent.click(insertAction!);
    });

    expect(onInsertPath).toHaveBeenCalledWith("/repo/src/App.vue");
    expect(onInsertPath).toHaveBeenCalledTimes(1);
  });
});
