import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import MessageBlockToolCall from "@/components/message/MessageBlockToolCall";
import type { DisplayAssistantMessageBlock } from "@/components/chat/messageListItems";

const { selectSessionMock } = vi.hoisted(() => ({
  selectSessionMock: vi.fn<(...args: any[]) => any>(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: { count?: number; mode?: string }) => {
      if (key === "toolCall.replacementsCount") {
        return `${params?.count ?? 0} replacements`;
      }
      if (key === "toolCall.badge.rtk") {
        return "RTK";
      }
      if (key === "chat.toolCall.subagents.summary") {
        return `${params?.mode ?? "mode"} · ${params?.count ?? 0} localized subagents`;
      }
      if (key === "chat.toolCall.subagents.mode.parallel") {
        return "localized parallel";
      }
      if (key === "chat.toolCall.subagents.mode.chain") {
        return "localized chain";
      }
      if (key === "chat.toolCall.subagents.status.running") {
        return "localized running";
      }
      if (key === "chat.toolCall.subagents.status.waiting_permission") {
        return "localized waiting permission";
      }
      if (key === "chat.toolCall.subagents.status.completed") {
        return "localized completed";
      }
      if (key === "chat.toolCall.subagents.unnamedTask") {
        return "Unnamed Task";
      }
      if (key === "settings.argosAgents.unnamed") {
        return "Unnamed Agent";
      }
      return key;
    },
  }),
}));

vi.mock("@/stores/theme", () => ({
  useThemeStore: () => ({
    isDark: false,
  }),
}));

vi.mock("@/stores/ui/session", () => ({
  useSessionStore: () => ({
    selectSession: selectSessionMock,
  }),
}));

const createBlock = (overrides: Partial<DisplayAssistantMessageBlock> = {}): DisplayAssistantMessageBlock => ({
  type: "tool_call",
  status: "success",
  timestamp: Date.now(),
  ...overrides,
  tool_call: {
    name: "edit_text",
    response: "",
    ...overrides.tool_call,
  },
});

beforeEach(() => {
  selectSessionMock.mockReset();
});

afterEach(() => {
  selectSessionMock.mockReset();
});

describe("MessageBlockToolCall", () => {
  it("renders diff response with CodeBlockNode", async () => {
    const response = JSON.stringify({
      success: true,
      originalCode: "alpha\nbeta",
      updatedCode: "alpha\ngamma",
      replacements: 1,
      language: "typescript",
    });
    const { container } = render(
      <MessageBlockToolCall
        block={createBlock({
          tool_call: { name: "edit_text", response },
        })}
      />,
    );

    const trigger = container.querySelector("div.inline-flex")!;
    await act(async () => {
      fireEvent.click(trigger);
    });

    const codeBlock = container.querySelector('[data-testid="code-block-node"]');
    expect(codeBlock).toBeTruthy();
  });

  it("falls back to preformatted text for non-diff responses", async () => {
    const { container } = render(
      <MessageBlockToolCall
        block={createBlock({
          tool_call: { name: "other_tool", response: "plain output" },
        })}
      />,
    );

    const trigger = container.querySelector("div.inline-flex")!;
    await act(async () => {
      fireEvent.click(trigger);
    });

    expect(container.querySelector('[data-testid="code-block-node"]')).toBeNull();
    expect(container.querySelector("pre")!.textContent).toContain("plain output");
  });

  it("renders image previews below params and response only after expansion", async () => {
    const { container } = render(
      <MessageBlockToolCall
        block={createBlock({
          tool_call: {
            name: "read",
            params: '{"path":"/tmp/screenshot.png"}',
            response: "vision analysis",
            imagePreviews: [
              {
                id: "file_read-1",
                data: "imgcache://screenshot.png",
                mimeType: "image/png",
                title: "screenshot.png",
                source: "file_read",
              },
            ],
          },
        })}
      />,
    );

    expect(screen.getByTestId("tool-call-image-badge").textContent).toContain("1");
    expect(screen.queryByTestId("tool-call-image-preview")).toBeNull();

    const trigger = container.querySelector("div.inline-flex")!;
    await act(async () => {
      fireEvent.click(trigger);
    });

    const params = screen.getByTestId("tool-call-params");
    const pre = container.querySelector("pre")!;
    const preview = screen.getByTestId("tool-call-image-preview");
    const paramsBeforeResponse = Boolean(params.compareDocumentPosition(pre) & Node.DOCUMENT_POSITION_FOLLOWING);
    const responseBeforePreview = Boolean(pre.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING);

    expect(paramsBeforeResponse).toBe(true);
    expect(responseBeforePreview).toBe(true);
    const previewImg = preview.querySelector("img")!;
    expect(previewImg.getAttribute("src")).toBe("imgcache://screenshot.png");
  });

  it("sanitizes unsafe argos image URLs", async () => {
    const { container } = render(
      <MessageBlockToolCall
        block={createBlock({
          tool_call: {
            name: "read",
            response: "vision analysis",
            imagePreviews: [
              {
                id: "unsafe-url-1",
                data: "javascript:alert(1)",
                mimeType: "argos/image-url",
                title: "unsafe.png",
                source: "tool_output",
              },
            ],
          },
        })}
      />,
    );

    const trigger = container.querySelector("div.inline-flex")!;
    await act(async () => {
      fireEvent.click(trigger);
    });

    const img = screen.getByTestId("tool-call-image-preview").querySelector("img")!;
    expect(img.getAttribute("src")).toBe("");
  });

  it("shows the first string parameter value as summary text", () => {
    render(
      <MessageBlockToolCall
        block={createBlock({
          tool_call: {
            name: "read",
            params: '{"path":"C:/repo/src/main.ts","line":1}',
          },
        })}
      />,
    );

    expect(screen.getByTestId("tool-call-summary").textContent).toBe("C:/repo/src/main.ts");
  });

  it("prefers path over offset in read summaries", () => {
    render(
      <MessageBlockToolCall
        block={createBlock({
          tool_call: {
            name: "read",
            params: '{"offset":5000,"path":"/tmp/a.ts"}',
          },
        })}
      />,
    );

    expect(screen.getByTestId("tool-call-summary").textContent).toBe("/tmp/a.ts");
  });

  it("prefers path over limit in read summaries", () => {
    render(
      <MessageBlockToolCall
        block={createBlock({
          tool_call: {
            name: "read",
            params: '{"limit":200,"path":"/tmp/a.ts"}',
          },
        })}
      />,
    );

    expect(screen.getByTestId("tool-call-summary").textContent).toBe("/tmp/a.ts");
  });

  it("prefers path over content in write summaries", () => {
    render(
      <MessageBlockToolCall
        block={createBlock({
          tool_call: {
            name: "write",
            params: '{"content":"hello world","path":"/tmp/a.ts"}',
          },
        })}
      />,
    );

    expect(screen.getByTestId("tool-call-summary").textContent).toBe("/tmp/a.ts");
  });

  it("uses the first query value as summary text", () => {
    render(
      <MessageBlockToolCall
        block={createBlock({
          tool_call: {
            name: "search",
            params: '{"query":"today bilibili hot videos","limit":10}',
          },
        })}
      />,
    );

    expect(screen.getByTestId("tool-call-summary").textContent).toBe("today bilibili hot videos");
    expect(screen.getByTestId("tool-call-name").className).toContain("shrink-0");
  });

  it("stringifies nested first parameter values into a single-line summary", () => {
    render(
      <MessageBlockToolCall
        block={createBlock({
          tool_call: {
            name: "custom_tool",
            params: '{"payload":{"foo":"bar","nested":{"ok":true}},"other":1}',
          },
        })}
      />,
    );

    expect(screen.getByTestId("tool-call-summary").textContent).toBe('{"foo":"bar","nested":{"ok":true}}');
  });

  it("falls back to raw params when the summary source is not JSON", () => {
    render(
      <MessageBlockToolCall
        block={createBlock({
          tool_call: {
            name: "exec",
            params: "raw-shell-command --flag value",
          },
        })}
      />,
    );

    expect(screen.getByTestId("tool-call-summary").textContent).toBe("raw-shell-command --flag value");
  });

  it("always exposes the full summary in the title attribute", () => {
    const summaryValue = "C:/workspace/" + "nested/".repeat(8) + "MessageBlockToolCall.vue";
    render(
      <MessageBlockToolCall
        block={createBlock({
          tool_call: {
            name: "exec",
            params: JSON.stringify({
              cwd: summaryValue,
            }),
          },
        })}
      />,
    );

    const summary = screen.getByTestId("tool-call-summary");
    expect(summary.getAttribute("title")).toBe(summaryValue);
  });

  it("keeps the collapsed label to tool name only even when a server name exists", () => {
    render(
      <MessageBlockToolCall
        block={createBlock({
          tool_call: {
            name: "exec",
            server_name: "agent-filesystem",
            params: '{"command":"pnpm run dev"}',
          },
        })}
      />,
    );

    expect(screen.getByTestId("tool-call-name").textContent).toBe("exec");
    expect(screen.queryByTestId("tool-call-expanded-title")).toBeNull();
  });

  it("shows the server-qualified title only inside the expanded panel", async () => {
    render(
      <MessageBlockToolCall
        block={createBlock({
          tool_call: {
            name: "exec",
            server_name: "agent/agent-filesystem",
            params: '{"command":"pnpm run dev"}',
            response: "ok",
          },
        })}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("tool-call-trigger"));
    });

    expect(screen.getByTestId("tool-call-expanded-title").textContent).toContain("agent-filesystem.exec");
  });

  it("shows an RTK badge for command-style tool calls when RTK was applied", () => {
    render(
      <MessageBlockToolCall
        block={createBlock({
          tool_call: {
            name: "exec",
            response: "ok",
            rtkApplied: true,
            rtkMode: "rewrite",
          },
        })}
      />,
    );

    expect(screen.getByTestId("tool-call-rtk-badge")).toBeTruthy();
    expect(screen.getByTestId("tool-call-rtk-badge").textContent).toBe("RTK");
  });

  it("shows summary text alongside the RTK badge", () => {
    render(
      <MessageBlockToolCall
        block={createBlock({
          tool_call: {
            name: "exec",
            params: '{"command":"pnpm run dev","background":true}',
            rtkApplied: true,
            rtkMode: "rewrite",
          },
        })}
      />,
    );

    expect(screen.getByTestId("tool-call-summary").textContent).toBe("pnpm run dev");
    expect(screen.getByTestId("tool-call-rtk-badge").textContent).toBe("RTK");
  });

  it("prefers command over earlier boolean fields in exec summaries", () => {
    render(
      <MessageBlockToolCall
        block={createBlock({
          tool_call: {
            name: "exec",
            params: '{"background":true,"command":"pnpm run dev"}',
          },
        })}
      />,
    );

    expect(screen.getByTestId("tool-call-summary").textContent).toBe("pnpm run dev");
  });

  it("renders raw params in the expanded panel", async () => {
    render(
      <MessageBlockToolCall
        block={createBlock({
          tool_call: {
            name: "exec",
            params: '{"command":"pnpm run dev","background":true}',
            response: "ok",
          },
        })}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("tool-call-trigger"));
    });

    const paramsPanel = screen.getByTestId("tool-call-params").textContent;

    expect(paramsPanel).toBe('{"command":"pnpm run dev","background":true}');
    expect(paramsPanel).toContain("pnpm run dev");
    expect(paramsPanel).toContain('"background":true');
    expect(paramsPanel).toContain('"command":"pnpm run dev"');
  });

  it("renders a dedicated running ring instead of the legacy pulse icon", () => {
    const { container } = render(
      <MessageBlockToolCall
        block={createBlock({
          status: "loading",
          tool_call: {
            name: "exec",
            params: '{"command":"pnpm run dev"}',
          },
        })}
      />,
    );

    expect(screen.getByTestId("tool-call-running-indicator")).toBeTruthy();
    expect(container.innerHTML).not.toContain("animate-pulse");
  });

  it("auto expands process tool calls while loading and collapses them when finished", async () => {
    const { rerender } = render(
      <MessageBlockToolCall
        block={createBlock({
          status: "loading",
          tool_call: {
            id: "process-1",
            name: "process",
            params: '{"action":"poll","sessionId":"session-1"}',
            response: "still running",
          },
        })}
      />,
    );

    await act(async () => {});
    expect(screen.getByTestId("tool-call-details")).toBeTruthy();

    rerender(
      <MessageBlockToolCall
        block={createBlock({
          status: "success",
          tool_call: {
            id: "process-1",
            name: "process",
            params: '{"action":"poll","sessionId":"session-1"}',
            response: "done",
          },
        })}
      />,
    );
    await act(async () => {});

    expect(screen.queryByTestId("tool-call-details")).toBeNull();
  });

  it("auto expands background exec calls while loading and collapses them when finished", async () => {
    const { rerender } = render(
      <MessageBlockToolCall
        block={createBlock({
          status: "loading",
          tool_call: {
            id: "exec-bg-1",
            name: "exec",
            params: '{"command":"pnpm run dev","background":true}',
            response: "booting",
          },
        })}
      />,
    );

    await act(async () => {});
    expect(screen.getByTestId("tool-call-details")).toBeTruthy();

    rerender(
      <MessageBlockToolCall
        block={createBlock({
          status: "success",
          tool_call: {
            id: "exec-bg-1",
            name: "exec",
            params: '{"command":"pnpm run dev","background":true}',
            response: "done",
          },
        })}
      />,
    );
    await act(async () => {});

    expect(screen.queryByTestId("tool-call-details")).toBeNull();
  });

  it("auto expands background skill_run calls while loading and collapses them when finished", async () => {
    const { rerender } = render(
      <MessageBlockToolCall
        block={createBlock({
          status: "loading",
          tool_call: {
            id: "skill-run-bg-1",
            name: "skill_run",
            params: '{"skill":"checks","script":"scripts/run.ts","background":true}',
            response: "booting",
          },
        })}
      />,
    );

    await act(async () => {});
    expect(screen.getByTestId("tool-call-details")).toBeTruthy();

    rerender(
      <MessageBlockToolCall
        block={createBlock({
          status: "success",
          tool_call: {
            id: "skill-run-bg-1",
            name: "skill_run",
            params: '{"skill":"checks","script":"scripts/run.ts","background":true}',
            response: "done",
          },
        })}
      />,
    );
    await act(async () => {});

    expect(screen.queryByTestId("tool-call-details")).toBeNull();
  });

  it("auto expands exec calls with a long timeout", async () => {
    render(
      <MessageBlockToolCall
        block={createBlock({
          status: "loading",
          tool_call: {
            id: "exec-timeout-1",
            name: "exec",
            params: '{"command":"pnpm test","timeoutMs":10000}',
            response: "running",
          },
        })}
      />,
    );

    await act(async () => {});

    expect(screen.getByTestId("tool-call-details")).toBeTruthy();
  });

  it("auto expands skill_run calls with a long timeout", async () => {
    render(
      <MessageBlockToolCall
        block={createBlock({
          status: "loading",
          tool_call: {
            id: "skill-run-timeout-1",
            name: "skill_run",
            params: '{"skill":"checks","script":"scripts/run.ts","timeoutMs":10000}',
            response: "running",
          },
        })}
      />,
    );

    await act(async () => {});

    expect(screen.getByTestId("tool-call-details")).toBeTruthy();
  });

  it("auto expands renamed exec tool calls that keep the exec contract", async () => {
    render(
      <MessageBlockToolCall
        block={createBlock({
          status: "loading",
          tool_call: {
            id: "exec-renamed-1",
            name: "agent-filesystem_exec",
            params: '{"command":"pnpm run dev","background":true}',
            response: "booting",
          },
        })}
      />,
    );

    await act(async () => {});

    expect(screen.getByTestId("tool-call-details")).toBeTruthy();
  });

  it("auto expands renamed process tool calls while loading and collapses them when finished", async () => {
    const { rerender } = render(
      <MessageBlockToolCall
        block={createBlock({
          status: "loading",
          tool_call: {
            id: "process-renamed-1",
            name: "agent-filesystem_process",
            params: '{"action":"poll","sessionId":"session-1"}',
            response: "still running",
          },
        })}
      />,
    );

    await act(async () => {});
    expect(screen.getByTestId("tool-call-details")).toBeTruthy();

    rerender(
      <MessageBlockToolCall
        block={createBlock({
          status: "success",
          tool_call: {
            id: "process-renamed-1",
            name: "agent-filesystem_process",
            params: '{"action":"poll","sessionId":"session-1"}',
            response: "done",
          },
        })}
      />,
    );
    await act(async () => {});

    expect(screen.queryByTestId("tool-call-details")).toBeNull();
  });

  it("re-applies auto expand when the loading tool call identity changes", async () => {
    const { rerender } = render(
      <MessageBlockToolCall
        block={createBlock({
          status: "loading",
          tool_call: {
            id: "exec-bg-identity-1",
            name: "exec",
            params: '{"background":true}',
            response: "booting",
          },
        })}
      />,
    );

    await act(async () => {});
    expect(screen.getByTestId("tool-call-details")).toBeTruthy();

    rerender(
      <MessageBlockToolCall
        block={createBlock({
          status: "loading",
          tool_call: {
            id: "exec-bg-identity-2",
            name: "exec",
            params: '{"background":true}',
            response: "still booting",
          },
        })}
      />,
    );
    await act(async () => {});

    expect(screen.getByTestId("tool-call-details")).toBeTruthy();
  });

  it("does not re-auto-expand after the user manually closes an auto-expanded block", async () => {
    const { rerender } = render(
      <MessageBlockToolCall
        block={createBlock({
          status: "loading",
          tool_call: {
            id: "process-2",
            name: "process",
            params: '{"action":"log","sessionId":"session-2"}',
            response: "line 1",
          },
        })}
      />,
    );

    await act(async () => {});
    expect(screen.getByTestId("tool-call-details")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByTestId("tool-call-trigger"));
    });
    await act(async () => {});
    expect(screen.queryByTestId("tool-call-details")).toBeNull();

    rerender(
      <MessageBlockToolCall
        block={createBlock({
          status: "loading",
          tool_call: {
            id: "process-2",
            name: "process",
            params: '{"action":"log","sessionId":"session-2"}',
            response: "line 1\nline 2",
          },
        })}
      />,
    );
    await act(async () => {});

    expect(screen.queryByTestId("tool-call-details")).toBeNull();
  });

  it("localizes subagent orchestrator summary and statuses", async () => {
    const { container } = render(
      <MessageBlockToolCall
        block={createBlock({
          status: "loading",
          tool_call: {
            id: "subagent-1",
            name: "subagent_orchestrator",
            params: '{"mode":"parallel"}',
            response: "",
          },
          extra: {
            subagentProgress: JSON.stringify({
              runId: "run-1",
              mode: "parallel",
              tasks: [
                {
                  taskId: "task-1",
                  title: "Inspect repo",
                  slotId: "slot-1",
                  sessionId: "child-1",
                  targetAgentName: "ACP Coder",
                  status: "running",
                  previewMarkdown: "line 1",
                },
                {
                  taskId: "task-2",
                  title: "Request approval",
                  slotId: "slot-2",
                  sessionId: "child-2",
                  targetAgentName: "Self Clone",
                  status: "waiting_permission",
                  previewMarkdown: "line 2",
                },
              ],
            }),
          },
        })}
      />,
    );

    await act(async () => {});

    expect(container.textContent).toContain("localized parallel · 2 localized subagents");
    expect(container.textContent).toContain("localized running");
    expect(container.textContent).toContain("localized waiting permission");
    expect(screen.getAllByTestId("subagent-task-trigger")).toHaveLength(2);
    expect(container.textContent).not.toContain("line 1");
    expect(container.textContent).not.toContain("line 2");
    expect(container.textContent).not.toContain("common.open");

    await act(async () => {
      fireEvent.click(screen.getAllByTestId("subagent-task-trigger")[0]);
    });

    expect(selectSessionMock).toHaveBeenCalledWith("child-1");
  });

  it("normalizes subagent task identifiers and fallback labels", async () => {
    render(
      <MessageBlockToolCall
        block={createBlock({
          status: "loading",
          tool_call: {
            id: "subagent-2",
            name: "subagent_orchestrator",
            params: '{"mode":"parallel"}',
            response: "",
          },
          extra: {
            subagentProgress: JSON.stringify({
              runId: "run-2",
              mode: "parallel",
              tasks: [
                {
                  slotId: "slot-alpha",
                  displayName: "Planner",
                  sessionId: "child-alpha",
                  status: "running",
                },
                {
                  slotId: "slot-beta",
                  sessionId: null,
                  status: "completed",
                },
                {
                  sessionId: null,
                  status: "completed",
                },
              ],
            }),
          },
        })}
      />,
    );

    await act(async () => {});

    const tasks = screen.getAllByTestId("subagent-task-trigger");
    expect(tasks).toHaveLength(3);
    expect(tasks[0].textContent).toContain("Planner");
    expect(tasks[1].textContent).toContain("Unnamed Agent");
    expect(tasks[1].textContent).toContain("slot-beta");
    expect(tasks[2].textContent).toContain("Unnamed Agent");
    expect(tasks[2].textContent).toContain("Unnamed Task");

    await act(async () => {
      fireEvent.click(tasks[0]);
    });

    expect(selectSessionMock).toHaveBeenCalledWith("child-alpha");
  });
});
