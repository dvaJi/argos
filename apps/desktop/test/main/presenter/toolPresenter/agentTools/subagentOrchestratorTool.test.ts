import { describe, expect, it, vi } from "vitest";
import type { ArgosInternalSessionUpdate } from "@/presenter/agentRuntimePresenter/internalSessionEvents";
import {
  SubagentOrchestratorTool,
  SUBAGENT_ORCHESTRATOR_TOOL_NAME,
} from "@/presenter/toolPresenter/agentTools/subagentOrchestratorTool";
import type { ConversationSessionInfo } from "@/presenter/toolPresenter/runtimePorts";

const buildSessionInfo = (overrides: Partial<ConversationSessionInfo> = {}): ConversationSessionInfo => ({
  sessionId: "parent-session",
  agentId: "argos",
  agentName: "Argos",
  agentType: "argos",
  providerId: "openai",
  modelId: "gpt-4.1",
  projectDir: "/workspace/parent-app",
  permissionMode: "full_access",
  generationSettings: null,
  disabledAgentTools: [],
  activeSkills: [],
  sessionKind: "regular",
  parentSessionId: null,
  subagentEnabled: true,
  subagentMeta: null,
  availableSubagentSlots: [
    {
      id: "reviewer",
      targetType: "self",
      displayName: "Reviewer Clone",
      description: "Review the delegated task.",
    },
  ],
  ...overrides,
});

describe("SubagentOrchestratorTool", () => {
  it("includes the parent session workdir in the child handoff", async () => {
    let listener: ((update: ArgosInternalSessionUpdate) => void) | null = null;
    let handoffMessage = "";
    const resolvedWorkdir = "/workspace/resolved-parent-workdir";

    const parentSession = buildSessionInfo({
      projectDir: "/workspace/parent-session-record",
    });
    const childSession = buildSessionInfo({
      sessionId: "child-session",
      agentName: "Reviewer Clone",
      projectDir: "/workspace/child-session-record",
      sessionKind: "subagent",
      parentSessionId: parentSession.sessionId,
      subagentEnabled: false,
      availableSubagentSlots: [],
    });
    const resolveConversationWorkdir = vi.fn<(...args: any[]) => any>().mockResolvedValue(resolvedWorkdir);
    const createSubagentSession = vi.fn<(...args: any[]) => any>().mockResolvedValue(childSession);

    const tool = new SubagentOrchestratorTool({
      resolveConversationWorkdir,
      resolveConversationSessionInfo: vi
        .fn<(...args: any[]) => any>()
        .mockImplementation(async (conversationId: string) =>
          conversationId === parentSession.sessionId ? parentSession : childSession,
        ),
      createSubagentSession,
      sendConversationMessage: vi.fn<(...args: any[]) => any>(async (conversationId: string, content: string) => {
        handoffMessage = content;
        setTimeout(() => {
          listener?.({
            sessionId: conversationId,
            kind: "blocks",
            updatedAt: Date.now(),
            previewMarkdown: "Checked auth routes",
            responseMarkdown: "Checked auth routes\nFound no directory mismatch in code.",
          });
          listener?.({
            sessionId: conversationId,
            kind: "status",
            updatedAt: Date.now() + 1,
            status: "idle",
          });
        }, 0);
      }),
      cancelConversation: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
      subscribeArgosSessionUpdates: vi.fn<(...args: any[]) => any>((callback) => {
        listener = callback;
        return () => {
          listener = null;
        };
      }),
      getSkillPresenter: vi.fn<(...args: any[]) => any>(() => ({})),
      getYoBrowserToolHandler: vi.fn<(...args: any[]) => any>(() => ({})),
      getFilePresenter: vi.fn<(...args: any[]) => any>(() => ({
        getMimeType: vi.fn<(...args: any[]) => any>(),
        prepareFileCompletely: vi.fn<(...args: any[]) => any>(),
      })),
      getLlmProviderPresenter: vi.fn<(...args: any[]) => any>(() => ({
        executeWithRateLimit: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
        generateCompletionStandalone: vi.fn<(...args: any[]) => any>(),
        generateImageStandalone: vi.fn<(...args: any[]) => any>(),
      })),
      createSettingsWindow: vi.fn<(...args: any[]) => any>(),
      sendToWindow: vi.fn<(...args: any[]) => any>(),
      getApprovedFilePaths: vi.fn<(...args: any[]) => any>(() => []),
      consumeSettingsApproval: vi.fn<(...args: any[]) => any>(() => false),
    } as any);

    const result = await tool.call(
      {
        mode: "chain",
        tasks: [
          {
            slotId: "reviewer",
            title: "Inspect auth flow",
            prompt:
              "Analyze the auth flow. A previous guess mentioned /workspace/current-project, but verify against the inherited workspace instead.",
            expectedOutput: "Return concise markdown findings.",
          },
        ],
      },
      parentSession.sessionId,
      {
        toolCallId: `${SUBAGENT_ORCHESTRATOR_TOOL_NAME}-1`,
      },
    );

    expect(resolveConversationWorkdir).toHaveBeenCalledWith(parentSession.sessionId);
    expect(createSubagentSession).toHaveBeenCalledWith(
      expect.objectContaining({
        projectDir: resolvedWorkdir,
      }),
    );
    expect(handoffMessage).toContain("Current Agent Working Directory:");
    expect(handoffMessage).toContain(resolvedWorkdir);
    expect(handoffMessage).not.toContain("Slot Description:");
    expect(handoffMessage).not.toContain("Review the delegated task.");
    expect(handoffMessage).not.toContain(parentSession.projectDir as string);
    expect(handoffMessage).not.toContain(childSession.projectDir as string);
    expect(result.content).toContain("Inspect auth flow");
  });

  it("starts background runs and supports list, info, and kill operations", async () => {
    const parentSession = buildSessionInfo();
    const childSession = buildSessionInfo({
      sessionId: "child-session",
      agentName: "Reviewer Clone",
      sessionKind: "subagent",
      parentSessionId: parentSession.sessionId,
      subagentEnabled: false,
      availableSubagentSlots: [],
    });
    const createSubagentSession = vi.fn<(...args: any[]) => any>().mockResolvedValue(childSession);
    const cancelConversation = vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined);

    const tool = new SubagentOrchestratorTool({
      resolveConversationWorkdir: vi.fn<(...args: any[]) => any>().mockResolvedValue(parentSession.projectDir),
      resolveConversationSessionInfo: vi.fn<(...args: any[]) => any>().mockResolvedValue(parentSession),
      createSubagentSession,
      sendConversationMessage: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
      cancelConversation,
      subscribeArgosSessionUpdates: vi.fn<(...args: any[]) => any>(() => () => undefined),
      getSkillPresenter: vi.fn<(...args: any[]) => any>(() => ({})),
      getYoBrowserToolHandler: vi.fn<(...args: any[]) => any>(() => ({})),
      getFilePresenter: vi.fn<(...args: any[]) => any>(() => ({
        getMimeType: vi.fn<(...args: any[]) => any>(),
        prepareFileCompletely: vi.fn<(...args: any[]) => any>(),
      })),
      getLlmProviderPresenter: vi.fn<(...args: any[]) => any>(() => ({
        executeWithRateLimit: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
        generateCompletionStandalone: vi.fn<(...args: any[]) => any>(),
        generateImageStandalone: vi.fn<(...args: any[]) => any>(),
      })),
      createSettingsWindow: vi.fn<(...args: any[]) => any>(),
      sendToWindow: vi.fn<(...args: any[]) => any>(),
      getApprovedFilePaths: vi.fn<(...args: any[]) => any>(() => []),
      consumeSettingsApproval: vi.fn<(...args: any[]) => any>(() => false),
    } as any);

    const started = await tool.call(
      {
        mode: "parallel",
        background: true,
        tasks: [
          {
            slotId: "reviewer",
            title: "Keep running",
            prompt: "Stay active until cancelled.",
          },
        ],
      },
      parentSession.sessionId,
    );
    const progress = JSON.parse((started.rawData?.toolResult as any).subagentProgress);
    const runId = progress.runId;

    expect(started.content).toContain("Subagent run started");
    expect(runId).toMatch(/\S+/);

    for (let index = 0; index < 10 && createSubagentSession.mock.calls.length === 0; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const listed = await tool.call({ operation: "list" }, parentSession.sessionId);
    expect(listed.content).toContain(runId);

    const info = await tool.call({ operation: "info", runId }, parentSession.sessionId);
    expect(info.content).toContain("Keep running");

    const killed = await tool.call({ operation: "kill", runId }, parentSession.sessionId);
    expect(killed.content).toContain("cancelled");
    expect(cancelConversation).toHaveBeenCalledWith(childSession.sessionId);
  });

  it("records completed child sessions as merged tape forks", async () => {
    let listener: ((update: ArgosInternalSessionUpdate) => void) | null = null;
    const parentSession = buildSessionInfo();
    const childSession = buildSessionInfo({
      sessionId: "child-session",
      agentName: "Reviewer Clone",
      sessionKind: "subagent",
      parentSessionId: parentSession.sessionId,
      subagentEnabled: false,
      availableSubagentSlots: [],
    });
    const mergeSubagentTape = vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined);
    const discardSubagentTape = vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined);

    const tool = new SubagentOrchestratorTool({
      resolveConversationWorkdir: vi.fn<(...args: any[]) => any>().mockResolvedValue(parentSession.projectDir),
      resolveConversationSessionInfo: vi.fn<(...args: any[]) => any>().mockResolvedValue(parentSession),
      createSubagentSession: vi.fn<(...args: any[]) => any>().mockResolvedValue(childSession),
      sendConversationMessage: vi.fn<(...args: any[]) => any>(async (conversationId: string) => {
        setTimeout(() => {
          listener?.({
            sessionId: conversationId,
            kind: "blocks",
            updatedAt: Date.now(),
            previewMarkdown: "Completed review",
            responseMarkdown: "Completed review\nNo issues found.",
          });
          listener?.({
            sessionId: conversationId,
            kind: "status",
            updatedAt: Date.now() + 1,
            status: "idle",
          });
        }, 0);
      }),
      cancelConversation: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
      subscribeArgosSessionUpdates: vi.fn<(...args: any[]) => any>((callback) => {
        listener = callback;
        return () => {
          listener = null;
        };
      }),
      mergeSubagentTape,
      discardSubagentTape,
      getSkillPresenter: vi.fn<(...args: any[]) => any>(() => ({})),
      getYoBrowserToolHandler: vi.fn<(...args: any[]) => any>(() => ({})),
      getFilePresenter: vi.fn<(...args: any[]) => any>(() => ({
        getMimeType: vi.fn<(...args: any[]) => any>(),
        prepareFileCompletely: vi.fn<(...args: any[]) => any>(),
      })),
      getLlmProviderPresenter: vi.fn<(...args: any[]) => any>(() => ({
        executeWithRateLimit: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
        generateCompletionStandalone: vi.fn<(...args: any[]) => any>(),
        generateImageStandalone: vi.fn<(...args: any[]) => any>(),
      })),
      createSettingsWindow: vi.fn<(...args: any[]) => any>(),
      sendToWindow: vi.fn<(...args: any[]) => any>(),
      getApprovedFilePaths: vi.fn<(...args: any[]) => any>(() => []),
      consumeSettingsApproval: vi.fn<(...args: any[]) => any>(() => false),
    } as any);

    await tool.call(
      {
        mode: "chain",
        tasks: [
          {
            id: "task-review",
            slotId: "reviewer",
            title: "Review task",
            prompt: "Review the current change.",
          },
        ],
      },
      parentSession.sessionId,
    );

    expect(mergeSubagentTape).toHaveBeenCalledWith(
      parentSession.sessionId,
      childSession.sessionId,
      expect.objectContaining({
        taskId: "task-review",
        slotId: "reviewer",
        status: "completed",
        title: "Review task",
      }),
    );
    expect(discardSubagentTape).not.toHaveBeenCalled();
  });

  it("leaves subagent tape unfinalized when merge fails so it can be retried", async () => {
    const mergeSubagentTape = vi.fn<(...args: any[]) => any>().mockRejectedValueOnce(new Error("merge failed")).mockResolvedValueOnce(undefined);
    const warnSpy = vi.spyOn<(...args: any[]) => any>(console, "warn").mockImplementation(() => undefined);
    const tool = new SubagentOrchestratorTool({
      mergeSubagentTape,
    } as any);
    const task = {
      sessionId: "child-session",
      tapeFinalized: false,
      taskId: "task-review",
      slotId: "reviewer",
      title: "Review task",
      status: "completed",
      resultSummary: "Done",
    };

    await (tool as any).finalizeTaskTape({
      parentSessionId: "parent-session",
      runId: "run-1",
      task,
    });
    expect(task.tapeFinalized).toBe(false);
    expect(task.tapeFinalizeError).toBe("merge failed");

    await (tool as any).finalizeTaskTape({
      parentSessionId: "parent-session",
      runId: "run-1",
      task,
    });

    expect(mergeSubagentTape).toHaveBeenCalledTimes(2);
    expect(task.tapeFinalized).toBe(true);
    expect(task.tapeFinalizeError).toBeUndefined();
    warnSpy.mockRestore();
  });

  it("marks subagent tape finalized when runtime has no tape merge support", async () => {
    const tool = new SubagentOrchestratorTool({} as any);
    const task = {
      sessionId: "child-session",
      tapeFinalized: false,
      taskId: "task-review",
      slotId: "reviewer",
      title: "Review task",
      status: "completed",
      resultSummary: "Done",
    };

    await (tool as any).finalizeTaskTape({
      parentSessionId: "parent-session",
      runId: "run-1",
      task,
    });

    expect(task.tapeFinalized).toBe(true);
    expect(task.tapeFinalizeError).toBeUndefined();
  });

  it("retries failed subagent tape finalization on terminal wait", async () => {
    let listener: ((update: ArgosInternalSessionUpdate) => void) | null = null;
    const parentSession = buildSessionInfo();
    const childSession = buildSessionInfo({
      sessionId: "child-session",
      agentName: "Reviewer Clone",
      sessionKind: "subagent",
      parentSessionId: parentSession.sessionId,
      subagentEnabled: false,
      availableSubagentSlots: [],
    });
    const mergeSubagentTape = vi.fn<(...args: any[]) => any>().mockRejectedValueOnce(new Error("merge failed")).mockResolvedValueOnce(undefined);
    const warnSpy = vi.spyOn<(...args: any[]) => any>(console, "warn").mockImplementation(() => undefined);

    const tool = new SubagentOrchestratorTool({
      resolveConversationWorkdir: vi.fn<(...args: any[]) => any>().mockResolvedValue(parentSession.projectDir),
      resolveConversationSessionInfo: vi.fn<(...args: any[]) => any>().mockResolvedValue(parentSession),
      createSubagentSession: vi.fn<(...args: any[]) => any>().mockResolvedValue(childSession),
      sendConversationMessage: vi.fn<(...args: any[]) => any>(async (conversationId: string) => {
        setTimeout(() => {
          listener?.({
            sessionId: conversationId,
            kind: "blocks",
            updatedAt: Date.now(),
            previewMarkdown: "Completed review",
            responseMarkdown: "Completed review\nNo issues found.",
          });
          listener?.({
            sessionId: conversationId,
            kind: "status",
            updatedAt: Date.now() + 1,
            status: "idle",
          });
        }, 0);
      }),
      cancelConversation: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
      subscribeArgosSessionUpdates: vi.fn<(...args: any[]) => any>((callback) => {
        listener = callback;
        return () => {
          listener = null;
        };
      }),
      mergeSubagentTape,
      getSkillPresenter: vi.fn<(...args: any[]) => any>(() => ({})),
      getYoBrowserToolHandler: vi.fn<(...args: any[]) => any>(() => ({})),
      getFilePresenter: vi.fn<(...args: any[]) => any>(() => ({
        getMimeType: vi.fn<(...args: any[]) => any>(),
        prepareFileCompletely: vi.fn<(...args: any[]) => any>(),
      })),
      getLlmProviderPresenter: vi.fn<(...args: any[]) => any>(() => ({
        executeWithRateLimit: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
        generateCompletionStandalone: vi.fn<(...args: any[]) => any>(),
        generateImageStandalone: vi.fn<(...args: any[]) => any>(),
      })),
      createSettingsWindow: vi.fn<(...args: any[]) => any>(),
      sendToWindow: vi.fn<(...args: any[]) => any>(),
      getApprovedFilePaths: vi.fn<(...args: any[]) => any>(() => []),
      consumeSettingsApproval: vi.fn<(...args: any[]) => any>(() => false),
    } as any);

    const started = await tool.call(
      {
        mode: "chain",
        background: true,
        tasks: [
          {
            id: "task-review",
            slotId: "reviewer",
            title: "Review task",
            prompt: "Review the current change.",
          },
        ],
      },
      parentSession.sessionId,
    );
    const runId = JSON.parse((started.rawData?.toolResult as any).subagentProgress).runId;

    const waited = await tool.call({ operation: "wait", runId, timeoutMs: 1000 }, parentSession.sessionId);
    const finalProgress = JSON.parse((waited.rawData?.toolResult as any).subagentFinal);

    expect(mergeSubagentTape).toHaveBeenCalledTimes(2);
    expect(waited.rawData?.isError).toBe(false);
    expect(waited.content).not.toContain("Tape Finalization: failed");
    expect(finalProgress.tasks[0]).toMatchObject({
      tapeFinalized: true,
    });
    expect(finalProgress.tasks[0].tapeFinalizeError).toBeUndefined();
    warnSpy.mockRestore();
  });

  it("exposes persistent subagent tape finalization failures and keeps retrying", async () => {
    let listener: ((update: ArgosInternalSessionUpdate) => void) | null = null;
    const parentSession = buildSessionInfo();
    const childSession = buildSessionInfo({
      sessionId: "child-session",
      agentName: "Reviewer Clone",
      sessionKind: "subagent",
      parentSessionId: parentSession.sessionId,
      subagentEnabled: false,
      availableSubagentSlots: [],
    });
    const mergeSubagentTape = vi.fn<(...args: any[]) => any>().mockRejectedValue(new Error("merge still failed"));
    const warnSpy = vi.spyOn<(...args: any[]) => any>(console, "warn").mockImplementation(() => undefined);

    const tool = new SubagentOrchestratorTool({
      resolveConversationWorkdir: vi.fn<(...args: any[]) => any>().mockResolvedValue(parentSession.projectDir),
      resolveConversationSessionInfo: vi.fn<(...args: any[]) => any>().mockResolvedValue(parentSession),
      createSubagentSession: vi.fn<(...args: any[]) => any>().mockResolvedValue(childSession),
      sendConversationMessage: vi.fn<(...args: any[]) => any>(async (conversationId: string) => {
        setTimeout(() => {
          listener?.({
            sessionId: conversationId,
            kind: "blocks",
            updatedAt: Date.now(),
            previewMarkdown: "Completed review",
            responseMarkdown: "Completed review\nNo issues found.",
          });
          listener?.({
            sessionId: conversationId,
            kind: "status",
            updatedAt: Date.now() + 1,
            status: "idle",
          });
        }, 0);
      }),
      cancelConversation: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
      subscribeArgosSessionUpdates: vi.fn<(...args: any[]) => any>((callback) => {
        listener = callback;
        return () => {
          listener = null;
        };
      }),
      mergeSubagentTape,
      getSkillPresenter: vi.fn<(...args: any[]) => any>(() => ({})),
      getYoBrowserToolHandler: vi.fn<(...args: any[]) => any>(() => ({})),
      getFilePresenter: vi.fn<(...args: any[]) => any>(() => ({
        getMimeType: vi.fn<(...args: any[]) => any>(),
        prepareFileCompletely: vi.fn<(...args: any[]) => any>(),
      })),
      getLlmProviderPresenter: vi.fn<(...args: any[]) => any>(() => ({
        executeWithRateLimit: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
        generateCompletionStandalone: vi.fn<(...args: any[]) => any>(),
        generateImageStandalone: vi.fn<(...args: any[]) => any>(),
      })),
      createSettingsWindow: vi.fn<(...args: any[]) => any>(),
      sendToWindow: vi.fn<(...args: any[]) => any>(),
      getApprovedFilePaths: vi.fn<(...args: any[]) => any>(() => []),
      consumeSettingsApproval: vi.fn<(...args: any[]) => any>(() => false),
    } as any);

    const started = await tool.call(
      {
        mode: "chain",
        background: true,
        tasks: [
          {
            id: "task-review",
            slotId: "reviewer",
            title: "Review task",
            prompt: "Review the current change.",
          },
        ],
      },
      parentSession.sessionId,
    );
    const runId = JSON.parse(((started.rawData?.toolResult as any) ?? {}).subagentProgress).runId;

    const waited = await tool.call({ operation: "wait", runId, timeoutMs: 1000 }, parentSession.sessionId);
    const waitedProgress = JSON.parse((waited.rawData?.toolResult ?? "").subagentFinal as any);

    expect(mergeSubagentTape).toHaveBeenCalledTimes(2);
    expect(waited.rawData?.isError).toBe(true);
    expect(waited.content).toContain("Tape Finalization: failed: merge still failed");
    expect(waitedProgress.tasks[0]).toMatchObject({
      tapeFinalized: false,
      tapeFinalizeError: "merge still failed",
    });

    const info = await tool.call({ operation: "info", runId }, parentSession.sessionId);

    expect(mergeSubagentTape).toHaveBeenCalledTimes(3);
    expect(info.rawData?.isError).toBe(true);

    const logged = await tool.call({ operation: "log", runId }, parentSession.sessionId);

    expect(mergeSubagentTape).toHaveBeenCalledTimes(4);
    expect(logged.rawData?.isError).toBe(true);
    warnSpy.mockRestore();
  });

  it("cancels a newly created child before handoff when the parent signal aborts", async () => {
    const parentSession = buildSessionInfo();
    const childSession = buildSessionInfo({
      sessionId: "child-session",
      agentName: "Reviewer Clone",
      sessionKind: "subagent",
      parentSessionId: parentSession.sessionId,
      subagentEnabled: false,
      availableSubagentSlots: [],
    });
    const abortController = new AbortController();
    let resolveCreate: ((value: ConversationSessionInfo) => void) | null = null;
    const createSubagentSession = vi.fn<(...args: any[]) => any>(
      () =>
        new Promise<ConversationSessionInfo>((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const sendConversationMessage = vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined);
    const cancelConversation = vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined);

    const tool = new SubagentOrchestratorTool({
      resolveConversationWorkdir: vi.fn<(...args: any[]) => any>().mockResolvedValue(parentSession.projectDir),
      resolveConversationSessionInfo: vi.fn<(...args: any[]) => any>().mockResolvedValue(parentSession),
      createSubagentSession,
      sendConversationMessage,
      cancelConversation,
      subscribeArgosSessionUpdates: vi.fn<(...args: any[]) => any>(() => () => undefined),
      getSkillPresenter: vi.fn<(...args: any[]) => any>(() => ({})),
      getYoBrowserToolHandler: vi.fn<(...args: any[]) => any>(() => ({})),
      getFilePresenter: vi.fn<(...args: any[]) => any>(() => ({
        getMimeType: vi.fn<(...args: any[]) => any>(),
        prepareFileCompletely: vi.fn<(...args: any[]) => any>(),
      })),
      getLlmProviderPresenter: vi.fn<(...args: any[]) => any>(() => ({
        executeWithRateLimit: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
        generateCompletionStandalone: vi.fn<(...args: any[]) => any>(),
        generateImageStandalone: vi.fn<(...args: any[]) => any>(),
      })),
      createSettingsWindow: vi.fn<(...args: any[]) => any>(),
      sendToWindow: vi.fn<(...args: any[]) => any>(),
      getApprovedFilePaths: vi.fn<(...args: any[]) => any>(() => []),
      consumeSettingsApproval: vi.fn<(...args: any[]) => any>(() => false),
    } as any);

    const runPromise = tool.call(
      {
        mode: "chain",
        tasks: [
          {
            slotId: "reviewer",
            title: "Abort before handoff",
            prompt: "Cancel this before the handoff is sent.",
          },
        ],
      },
      parentSession.sessionId,
      {
        signal: abortController.signal,
      },
    );

    for (let index = 0; index < 10 && createSubagentSession.mock.calls.length === 0; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    abortController.abort();
    resolveCreate?.(childSession);

    await expect(runPromise).rejects.toThrow("subagent_orchestrator cancelled.");
    expect(sendConversationMessage).not.toHaveBeenCalled();
    expect(cancelConversation).toHaveBeenCalledWith(childSession.sessionId);
  });
});
